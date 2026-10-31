// SimWorldView: the real world of F2a (inside an ObstSession) seen through the WorldView the renderer draws (view.ts). The renderer never imports
// the simulation: this file maps it once per render frame. FakeWorld (stub.ts) stays for the harness and the renderer's own tests.
import {
  CRUMBLE_FALL_SEC,
  DT,
  TILE,
  cameraHints,
  darkView,
  hangingOnRope,
  previewB,
  type BPreview,
  type Body,
  type ObstSession,
  type PlayerState,
  type World,
} from '../../index';
import type { Difficulty } from '@pichi/core/difficulty';
import type { GameMode, ParsedLevel, TileGrid } from '../../index';
import { entitiesFromLevel } from './stub';
import type { EntityView, HandAction, HazardView, HudView, PlayerView, RopeView, WorldView } from './view';

// biome-ignore format: one-line lookup table (keeps file within size budget)
const HINT: Record<BPreview['action'], HandAction> = { anchor: 'anchor', lift: 'lift', grab: 'grab', plant: 'plant', unplant: 'release', release: 'release', throw: 'throw', pass: 'grab', none: 'none' };

export class SimWorldView implements WorldView {
  readonly level: ParsedLevel;
  readonly grid: TileGrid;
  readonly mode: GameMode;
  readonly difficulty: Difficulty;
  alpha = 0;
  players: PlayerView[] = [];
  ropes: RopeView[] = [];
  entities: EntityView[] = [];
  hazard: HazardView | null = null;
  hud: HudView;
  look: WorldView['look'] = null;
  bubbleSec: number;
  camp: WorldView['camp'] = null;
  wind: WorldView['wind'] = null;
  dark: WorldView['dark'] = null;
  private statics: EntityView[];
  private byId = new Map<string, EntityView>();
  private bubbleSince = new Map<number, number>();

  // Built for ONE world: a new level makes a new SimWorldView (the scene notices the change and rebuilds the picture).
  constructor(
    private session: ObstSession,
    readonly world: World = session.world,
    private names: (slot: number) => string = (s) => `J${s + 1}`,
    private looks: (slot: number) => PlayerView['ap'] = () => undefined,
  ) {
    this.level = world.level;
    this.grid = world.grid;
    this.mode = world.mode;
    this.difficulty = world.difficulty;
    this.bubbleSec = world.dparams.bubbleSec;
    this.statics = entitiesFromLevel(world.level);
    for (const e of this.statics) this.byId.set(e.id, e);
    this.hud = {
      timeSec: 0,
      lives: world.lives,
      livesMax: world.dparams.lives,
      starsTaken: 0,
      levelIndex: session.levelIndex,
      levelCount: session.levelCount,
    };
    this.sync();
  }

  // Call once per render frame, after session.advance().
  sync(): void {
    const w = this.world;
    this.alpha = this.session.alpha;
    this.syncPlayers(w);
    this.syncRopes(w);
    this.syncEntities(w);
    const hz = w.ent.hazard;
    this.hazard = hz ? { kind: hz.kind, pos: hz.pos, frozen: hz.frozen > 0 } : null;
    const h = this.hud;
    h.timeSec = w.result ? w.result.timeSec : w.tick * DT;
    h.lives = w.lives;
    h.starsTaken = w.ent.stars.reduce((n, s) => n + (s.taken ? 1 : 0), 0);
    h.levelIndex = this.session.levelIndex;
    h.levelCount = this.session.levelCount;
    this.look = cameraHints(w);
    this.bubbleSec = w.dparams.bubbleSec;
    this.camp = w.camp ? { countdown: w.countdown ? Math.ceil(w.countdown.steps / 60) : null, refills: w.refills } : null;
    this.dark = darkView(w);
    const wd = w.level.def.wind;
    this.wind =
      w.wind && wd
        ? {
            phase: w.wind.phase,
            dir: w.wind.dir,
            zone: wd.zone ? { x: wd.zone.x * TILE, y: wd.zone.y * TILE, w: wd.zone.w * TILE, h: wd.zone.h * TILE } : null,
          }
        : null;
  }

  private syncPlayers(w: World): void {
    const bodies: (Body | undefined)[] = [];
    for (const p of w.players) bodies[p.slot] = p.body;
    const cordada = new Map<number, number>();
    for (const r of w.ropes) for (const m of r.members) cordada.set(m, r.id);
    const out: PlayerView[] = [];
    for (const p of w.players) {
      const b = p.body,
        prev = this.session.prev[p.slot] ?? { x: b.x, y: b.y };
      const bubble = p.mode === 'bubble' && p.bubble ? this.bubbleOf(p) : null;
      if (!bubble) this.bubbleSince.delete(p.slot);
      const active = p.connected && p.mode === 'active';
      const anchored = p.holding?.kind === 'ring';
      const hint = active ? HINT[previewB(w, p.slot).action] : 'none';
      out.push({
        id: p.slot,
        slot: p.slot,
        name: this.names(p.slot),
        ap: this.looks(p.slot),
        connected: p.connected,
        x: b.x,
        y: b.y,
        prevX: prev.x,
        prevY: prev.y,
        vx: b.vx,
        vy: b.vy,
        facing: b.facing,
        grounded: b.grounded,
        signal: p.camp.signal?.kind ?? null,
        dead: p.mode === 'dead',
        bubble,
        invulnSec: p.invuln * DT,
        planted: p.planted,
        hanging: active && !b.grounded && (anchored || hangingOnRope(w.ropes, p.slot, bodies)),
        anchored,
        holding: !p.holding || anchored ? 'none' : p.holding.kind === 'ring' ? 'none' : p.holding.kind,
        carriedBy: p.carriedBy,
        thrown: p.thrown > 0,
        inGoal: p.inGoal,
        cordada: cordada.get(p.slot) ?? -1,
        // 'plant' is quiet: only for an idle grounded player (the view draws it faint), never while moving
        hint: hint === 'plant' && (!b.grounded || Math.abs(b.vx) > 12) ? 'none' : hint,
      });
    }
    this.players = out;
  }

  private bubbleOf(p: PlayerState): PlayerView['bubble'] {
    if (p.bubble?.arrived) {
      this.bubbleSince.delete(p.slot);
      return { phase: 'pop', t: p.timer * DT };
    }
    const since = this.bubbleSince.get(p.slot) ?? this.world.tick;
    this.bubbleSince.set(p.slot, since);
    return { phase: 'fly', t: (this.world.tick - since) * DT };
  }

  private syncRopes(w: World): void {
    this.ropes = w.ropes.map((r) => ({
      id: r.id,
      cordada: r.id,
      base: r.links[0]?.base,
      links: r.links.map((l) => ({ a: l.a, b: l.b, tension: l.tension, active: l.active, elastic: l.elastic })),
    }));
  }

  private syncEntities(w: World): void {
    const e = w.ent,
      by = this.byId;
    const set = (id: string, f: (v: EntityView) => void) => {
      const v = by.get(id);
      if (v) f(v);
    };
    e.stars.forEach((s, i) =>
      set(`star${i}`, (v) => {
        v.on = s.taken;
      }),
    );
    e.checkpoints.forEach((c, i) =>
      set(`cp${i}`, (v) => {
        v.on = c.activated;
      }),
    );
    set('goal0', (v) => {
      const conn = w.players.filter((p) => p.connected);
      v.on = conn.length > 0 && conn.every((p) => p.inGoal);
    });
    e.rings.forEach((_r, i) =>
      set(`ring${i}`, (v) => {
        const h = w.players.find((p) => p.holding?.kind === 'ring' && p.holding.id === i);
        v.on = !!h;
        v.holder = h ? h.slot : -1;
      }),
    );
    const lights = e.boxes.filter((b) => !b.heavy);
    lights.forEach((b, i) =>
      set(`box${i}`, (v) => {
        v.x = b.x;
        v.y = b.y;
        v.holder = b.holders[0] ?? -1;
      }),
    );
    e.boxes
      .filter((b) => b.heavy)
      .forEach((b, i) =>
        set(`hbox${i}`, (v) => {
          v.x = b.x;
          v.y = b.y;
          v.holder = b.holders[0] ?? -1;
          v.on = b.holders.length >= 2;
        }),
      );
    e.keys.forEach((k, i) =>
      set(`key${i}`, (v) => {
        v.x = k.x - TILE / 2;
        v.y = k.y - TILE / 2;
        v.on = k.used || k.heldBy >= 0;
        v.holder = k.heldBy;
      }),
    );
    for (const a of e.activators)
      set(`obj${a.letter}`, (v) => {
        v.on = a.pressed || a.latched;
        v.value =
          a.kind === 'target'
            ? Math.min(1, (a.timer * DT) / (w.camp?.targetSec ?? 4))
            : a.required > 0
              ? Math.min(1, a.load / a.required)
              : 0;
      });
    e.pickaxes.forEach((k, i) =>
      set(`pick${i}`, (v) => {
        v.x = k.x - TILE / 2;
        v.y = k.y - TILE / 2;
        v.on = k.heldBy >= 0;
        v.holder = k.heldBy;
      }),
    );
    e.lanterns.forEach((k, i) =>
      set(`lantern${i}`, (v) => {
        v.x = k.x - TILE / 2;
        v.y = k.y - TILE / 2;
        v.on = k.heldBy >= 0;
        v.holder = k.heldBy;
      }),
    );
    for (const o of e.objectives)
      set(`obj${o.letter}`, (v) => {
        v.on = o.open;
        v.x = o.rect.x + o.ox;
        v.y = o.rect.y + o.oy;
        if (o.kind === 'geyser')
          v.value = o.phase / 2; // 0 calm, 0.5 bubbling, 1 erupting
        else if (o.kind === 'sinker') v.value = Math.min(1, o.oy / Math.max(1, (o.param as { travel: number }).travel * TILE));
      });
    // crumbling tiles: only the ones that are shaking or gone get a sprite
    const live: EntityView[] = [];
    for (const v of this.statics) live.push(v);
    for (const c of e.crumbles) {
      if (c.state === 0) continue;
      const fall = Math.round(CRUMBLE_FALL_SEC / DT);
      const id = `cr${c.x}_${c.y}`;
      let v = by.get(id);
      if (!v) {
        v = { id, kind: 'crumble', x: c.x * TILE, y: c.y * TILE, w: TILE, h: TILE, tag: '', on: false, value: 0, label: '', holder: -1 };
        by.set(id, v);
      }
      if (c.state === 1) {
        v.on = false;
        v.value = Math.min(1, c.t / fall);
        v.y = c.y * TILE;
      } else {
        const k = Math.min(1, c.t / 15);
        v.on = true;
        v.value = k;
        v.y = c.y * TILE + k * 70;
      }
      live.push(v);
    }
    e.enemies.forEach((en, i) => {
      // campaign soft enemies: no static twin, they are made as they are first seen
      const id = `enemy${i}`;
      let v = by.get(id);
      if (!v) {
        v = { id, kind: 'enemy', x: en.x, y: en.y, w: en.w, h: en.h, tag: '', on: false, value: 0, label: '', holder: -1 };
        by.set(id, v);
      }
      v.x = en.x;
      v.y = en.y;
      v.w = en.w;
      v.h = en.h;
      v.on = en.stun > 0;
      v.value = en.dir > 0 ? 1 : 0;
      live.push(v);
    });
    this.entities = live;
  }
}
