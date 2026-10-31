// FakeWorld, layer 1: state, constructor, accessors, rope tension and the sync of the PlayerViews. (Layers: core -> lifecycle -> interactions -> world.)
import { cordadas, entitiesFromLevel } from './level';
import {
  DT,
  DIFFICULTY_PARAMS,
  PLAYER_H,
  PLAYER_W,
  ROPE_LEN,
  TILE,
  buildGrid,
  newBody,
  parseLevelStrict,
  type Body,
  type GameMode,
  type LevelDef,
  type ObstEvents,
  type ParsedLevel,
  type TileGrid,
} from '../../../index';
import type { Difficulty } from '@pichi/core/difficulty';
import type { Emitter } from '@pichi/core/emitter';
import type { EntityView, HandAction, HazardView, HudView, PlayerView, RopeView } from '../view';

export interface Slot {
  view: PlayerView;
  body: Body;
  carryId: number;
  planted: boolean;
  respawnAt: number;
  lastB: boolean;
  bubbleT: number;
  nextJumpOk: number;
  bubbleTarget: { x: number; y: number } | null;
}

export class StubCore {
  readonly level: ParsedLevel;
  readonly grid: TileGrid;
  alpha = 0;
  players: PlayerView[] = [];
  ropes: RopeView[] = [];
  entities: EntityView[];
  hazard: HazardView | null = null;
  hud: HudView;
  protected slots: Slot[] = [];
  protected acc = 0;
  protected stepN = 0;
  protected cps: number[] = [];
  protected ropeSet: number[][];
  protected lastCp = 0;
  protected clear = false;
  protected tautPrev = new Map<string, number>();
  pendingBubbles: number[] = [];
  forced: Partial<PlayerView>[] = []; // harness: poses to hold (applied after every sync), e.g. forced[3] = { hanging: true }

  constructor(
    def: LevelDef,
    readonly n: number,
    readonly mode: GameMode,
    readonly difficulty: Difficulty,
    protected bus?: Emitter<ObstEvents>,
  ) {
    this.level = parseLevelStrict(def);
    this.grid = buildGrid(this.level, mode);
    this.entities = entitiesFromLevel(this.level);
    this.ropeSet = mode === 'chain' ? cordadas(n, def.cordadaMax ?? 4) : [];
    const sp = this.level.markers.spawn[0]!;
    for (let i = 0; i < n; i++) {
      const x = sp.x * TILE + (TILE - PLAYER_W) / 2 + (i - (n - 1) / 2) * 9,
        y = (sp.y + 1) * TILE - PLAYER_H;
      const body = newBody(i, x, y);
      const view: PlayerView = {
        id: i,
        slot: i,
        name: `J${i + 1}`,
        connected: true,
        x,
        y,
        prevX: x,
        prevY: y,
        vx: 0,
        vy: 0,
        facing: 1,
        grounded: false,
        dead: false,
        bubble: null,
        invulnSec: 0,
        planted: false,
        hanging: false,
        anchored: false,
        holding: 'none',
        carriedBy: -1,
        thrown: false,
        inGoal: false,
        cordada: this.ropeSet.findIndex((r) => r.includes(i)),
        hint: 'none',
      };
      this.slots.push({
        view,
        body,
        carryId: -1,
        planted: false,
        respawnAt: -1,
        lastB: false,
        bubbleT: 0,
        nextJumpOk: 0,
        bubbleTarget: null,
      });
    }
    this.players = this.slots.map((s) => s.view);
    this.hud = {
      timeSec: 0,
      lives: DIFFICULTY_PARAMS[difficulty].lives,
      livesMax: DIFFICULTY_PARAMS[difficulty].lives,
      starsTaken: 0,
      levelIndex: 0,
      levelCount: 3,
    };
    this.refreshRopes();
  }

  protected emit<K extends keyof ObstEvents>(k: K, v: ObstEvents[K]) {
    this.bus?.emit(k, v);
  }
  get timeSec() {
    return this.stepN * DT;
  }
  body(i: number): Body {
    return this.slots[i]!.body;
  }
  centre(i: number) {
    const b = this.slots[i]!.body;
    return { x: b.x + PLAYER_W / 2, y: b.y + PLAYER_H / 2 };
  }
  teleport(i: number, tx: number, ty: number) {
    const s = this.slots[i]!;
    s.body.x = tx * TILE + (TILE - PLAYER_W) / 2;
    s.body.y = (ty + 1) * TILE - PLAYER_H;
    s.body.vx = s.body.vy = 0;
    s.view.prevX = s.body.x;
    s.view.prevY = s.body.y;
  }
  requestBubbles(ids: readonly number[]) {
    for (const id of ids) if (!this.pendingBubbles.includes(id)) this.pendingBubbles.push(id);
  }

  protected sync() {
    for (const s of this.slots) {
      const v = s.view,
        b = s.body;
      v.x = b.x;
      v.y = b.y;
      v.vx = b.vx;
      v.vy = b.vy;
      v.grounded = b.grounded;
      v.hanging = !b.grounded && !v.bubble && !v.thrown && this.tension(v.id) > 0.97 && b.vy > -50;
      let hint: HandAction = 'none';
      if (v.holding === 'player') hint = 'throw';
      else if (s.planted) hint = 'release';
      else if (
        b.grounded &&
        this.slots.some((o) => o !== s && !o.view.dead && !o.view.bubble && Math.abs(o.body.x - b.x) < 40 && Math.abs(o.body.y - b.y) < 40)
      )
        hint = 'lift';
      else if (b.grounded) hint = 'plant';
      v.hint = hint;
      Object.assign(v, this.forced[v.id] ?? {});
    }
    this.refreshRopes();
  }
  tension(id: number): number {
    let t = 0;
    for (const g of this.ropeSet) {
      const k = g.indexOf(id);
      if (k < 0) continue;
      for (const j of [k - 1, k + 1])
        if (g[j] !== undefined) {
          const a = this.centre(id),
            b = this.centre(g[j]!);
          t = Math.max(t, Math.hypot(a.x - b.x, a.y - b.y) / ROPE_LEN);
        }
    }
    return t;
  }
  protected refreshRopes() {
    this.ropes = this.ropeSet.map((g, gi) => ({
      id: gi,
      cordada: gi,
      links: g.slice(0, -1).map((a, k) => {
        const b = g[k + 1]!,
          A = this.slots[a]!,
          B = this.slots[b]!,
          ca = this.centre(a),
          cb = this.centre(b);
        const tension = Math.hypot(ca.x - cb.x, ca.y - cb.y) / ROPE_LEN;
        const key = `${gi}-${k}`,
          prev = this.tautPrev.get(key) ?? 0;
        if (tension > 0.97 && prev <= 0.97) this.emit('obst.ropeTaut', { rope: gi, link: k, tension });
        if (tension > 1.04 && prev <= 1.04) this.emit('obst.ropeStrain', { rope: gi, link: k, tension });
        this.tautPrev.set(key, tension);
        return { a, b, tension, active: !A.view.bubble && !B.view.bubble && !A.view.dead && !B.view.dead };
      }),
    }));
  }
}
