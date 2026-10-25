// FakeWorld: a stand-in for F2a's world so the renderer can be exercised before the real one exists. TEST AND HARNESS ONLY: it uses the
// real F1 physics (stepPlayers) but fakes the rest (rope = naive position correction, lift/throw, bubbles, checkpoints, stars, goal).
// It implements WorldView (view.ts) and publishes obst.* events on a bus, exactly what the final adapter must do.
import {
  BUBBLE_INVULN_SEC,
  BUBBLE_POP_SEC,
  BUBBLE_SPEED_TILES,
  DT,
  DIFFICULTY_PARAMS,
  PLAYER_H,
  PLAYER_W,
  ROPE_LEN,
  TILE,
  T,
  boxHitsHazard,
  boxHitsSolid,
  buildGrid,
  newBody,
  parseLevelStrict,
  physicsFor,
  stepPlayers,
  tileAt,
  type Body,
  type GameMode,
  type LevelDef,
  type ObstEvents,
  type ParsedLevel,
  type StepInput,
  type TileGrid,
} from '@party/shared/obstaculos';
import type { Difficulty } from '@party/shared/difficulty';
import type { Emitter } from '@party/shared/events';
import type { EntityView, HandAction, HazardView, HudView, PlayerView, RopeView, WorldView } from './view';

export type Controller = (i: number, w: FakeWorld) => StepInput & { grab?: boolean };

export function cordadas(n: number, max = 4): number[][] {
  const sizes = n <= max ? [n] : n === 5 ? [3, 2] : n === 6 ? [3, 3] : n === 7 ? [4, 3] : [4, 4];
  let k = 0;
  return sizes.map((s) => Array.from({ length: s }, () => k++));
}

// Static entities every level has: stars, checkpoints, goal, rings, boxes, keys, and objects from params (plates, gates...).
export function entitiesFromLevel(p: ParsedLevel): EntityView[] {
  const out: EntityView[] = [];
  const e = (id: string, kind: EntityView['kind'], x: number, y: number, w = TILE, h = TILE, tag = '', label = ''): void => {
    out.push({ id, kind, x, y, w, h, tag, on: false, value: 0, label, holder: -1 });
  };
  p.markers.star.forEach((c, i) => e(`star${i}`, 'star', c.x * TILE, c.y * TILE));
  p.markers.checkpoint.forEach((c, i) => e(`cp${i}`, 'checkpoint', c.x * TILE, c.y * TILE));
  p.markers.goal.forEach((c, i) => e(`goal${i}`, 'goal', c.x * TILE, c.y * TILE));
  p.markers.ring.forEach((c, i) => e(`ring${i}`, 'ring', c.x * TILE, c.y * TILE));
  p.markers.box.forEach((c, i) => e(`box${i}`, 'box', c.x * TILE, c.y * TILE));
  p.markers.heavyBox.forEach((c, i) => e(`hbox${i}`, 'heavyBox', c.x * TILE, c.y * TILE, TILE, TILE, '', '2'));
  p.markers.key.forEach((c, i) => e(`key${i}`, 'key', c.x * TILE, c.y * TILE));
  p.markers.pickaxe.forEach((c, i) => e(`pick${i}`, 'pickaxe', c.x * TILE, c.y * TILE));
  p.markers.lantern.forEach((c, i) => e(`lantern${i}`, 'lantern', c.x * TILE, c.y * TILE));
  p.markers.bungee.forEach((c, i) => e(`ring${p.markers.ring.length + i}`, 'ring', c.x * TILE, c.y * TILE, TILE, TILE, '', 'elastic')); // the elastic rings follow the plain ones (the sim's ring order)
  for (const o of Object.values(p.objects)) {
    const b = o.bounds,
      prm = o.param;
    if (!prm) continue;
    const kind =
      prm.kind === 'plate'
        ? 'plate'
        : prm.kind === 'lever'
          ? 'lever'
          : prm.kind === 'target'
            ? 'target'
            : prm.kind === 'gate'
              ? 'gate'
              : prm.kind === 'ladder'
                ? 'ladder'
                : prm.kind === 'mover'
                  ? 'mover'
                  : prm.kind === 'sinker'
                    ? 'sinker'
                    : prm.kind === 'geyser'
                      ? 'geyser'
                      : 'balance';
    const label =
      prm.kind === 'plate'
        ? typeof prm.weight === 'number'
          ? String(prm.weight)
          : prm.weight === 'half-up'
            ? '½↑'
            : prm.weight === 'half-down'
              ? '½↓'
              : prm.weight === 'all'
                ? 'todos'
                : 'n-1'
        : '';
    e(`obj${o.char}`, kind, b.x * TILE, b.y * TILE, b.w * TILE, b.h * TILE, o.char, label);
  }
  return out;
}

interface Slot {
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

export class FakeWorld implements WorldView {
  readonly level: ParsedLevel;
  readonly grid: TileGrid;
  alpha = 0;
  players: PlayerView[] = [];
  ropes: RopeView[] = [];
  entities: EntityView[];
  hazard: HazardView | null = null;
  hud: HudView;
  private slots: Slot[] = [];
  private acc = 0;
  private stepN = 0;
  private cps: number[] = [];
  private ropeSet: number[][];
  private lastCp = 0;
  private clear = false;
  private tautPrev = new Map<string, number>();
  controller: Controller = () => ({ move: 0, down: false, jump: false });
  pendingBubbles: number[] = [];
  forced: Partial<PlayerView>[] = []; // harness: poses to hold (applied after every sync), e.g. forced[3] = { hanging: true }

  constructor(
    def: LevelDef,
    readonly n: number,
    readonly mode: GameMode,
    readonly difficulty: Difficulty,
    private bus?: Emitter<ObstEvents>,
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

  private emit<K extends keyof ObstEvents>(k: K, v: ObstEvents[K]) {
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

  // Real-time driver: call with the frame delta; runs fixed 60 Hz steps (max 4) and sets alpha for interpolation.
  advance(dtMs: number) {
    this.acc += Math.min(dtMs, 4 * DT * 1000);
    let steps = 0;
    while (this.acc >= DT * 1000 && steps < 4) {
      this.step();
      this.acc -= DT * 1000;
      steps++;
    }
    this.alpha = this.acc / (DT * 1000);
  }

  step() {
    this.stepN++;
    const now = this.stepN * DT;
    for (const s of this.slots) {
      s.view.prevX = s.body.x;
      s.view.prevY = s.body.y;
    }
    // bubbles requested by the camera
    for (const id of this.pendingBubbles.splice(0)) this.makeBubble(id);
    const live = this.slots.filter((s) => !s.view.dead && !s.view.bubble && s.view.carriedBy < 0);
    const inputs: StepInput[] = live.map((s) => {
      const c = this.controller(s.view.id, this);
      if (c.grab && !s.lastB) this.pressB(s);
      s.lastB = !!c.grab;
      return s.planted || s.view.holding === 'player'
        ? { move: 0, down: false, jump: c.jump }
        : { move: c.move, down: c.down, jump: c.jump };
    });
    const evs = stepPlayers(
      live.map((s) => s.body),
      inputs,
      this.grid,
      physicsFor(this.difficulty),
    );
    live.forEach((s, k) => {
      const e = evs[k]!,
        v = s.view;
      if (e.jump) this.emit('obst.jump', { player: v.id, kind: e.jump });
      if (e.land > 0) {
        this.emit('obst.land', { player: v.id, impact: e.land, on: e.landOn });
        v.thrown = false;
      }
      if (inputs[k]!.move !== 0) v.facing = inputs[k]!.move > 0 ? 1 : -1;
    });
    this.ropePass();
    // carried players ride on their holder's head
    for (const s of this.slots)
      if (s.view.carriedBy >= 0) {
        const h = this.slots[s.view.carriedBy]!.body;
        s.body.x = h.x;
        s.body.y = h.y - PLAYER_H - 4;
        s.body.vx = s.body.vy = 0;
      }
    // bubbles, deaths, pickups
    for (const s of this.slots) {
      const v = s.view;
      if (v.bubble) this.stepBubble(s, now);
      else if (v.dead) {
        if (now >= s.respawnAt) this.respawn(s, 'checkpoint');
      } else {
        v.invulnSec = Math.max(0, v.invulnSec - DT);
        if (v.invulnSec <= 0 && (boxHitsHazard(this.grid, s.body.x, s.body.y, PLAYER_W, PLAYER_H) || s.body.y > this.grid.h * TILE + 200))
          this.kill(
            s,
            s.body.y > this.grid.h * TILE
              ? 'fall'
              : tileAt(this.grid, Math.floor((s.body.x + PLAYER_W / 2) / TILE), Math.floor((s.body.y + PLAYER_H / 2) / TILE)) === T.Liquid
                ? 'liquid'
                : 'spikes',
            now,
          );
      }
    }
    this.pickups();
    this.sync();
    if (!this.clear) this.hud.timeSec = now;
  }

  private pressB(s: Slot) {
    const v = s.view,
      b = s.body;
    if (v.holding === 'player') {
      // throw
      const t = this.slots[s.carryId]!;
      t.view.carriedBy = -1;
      t.view.thrown = true;
      t.body.vx = 420 * v.facing;
      t.body.vy = -950;
      v.holding = 'none';
      this.emit('obst.throw', { player: v.id, target: t.view.id, vx: t.body.vx, vy: t.body.vy });
      s.carryId = -1;
      return;
    }
    if (s.planted) {
      s.planted = false;
      v.planted = false;
      this.emit('obst.release', { player: v.id });
      return;
    }
    const near = this.slots.find(
      (o) =>
        o !== s &&
        !o.view.dead &&
        !o.view.bubble &&
        Math.abs(o.body.x - b.x) < 40 &&
        Math.abs(o.body.y - b.y) < 40 &&
        o.view.carriedBy < 0 &&
        b.grounded,
    );
    if (near) {
      near.view.carriedBy = v.id;
      v.holding = 'player';
      s.carryId = near.view.id;
      this.emit('obst.grab', { player: v.id, target: 'player', targetId: near.view.id });
      return;
    }
    if (b.grounded) {
      s.planted = true;
      v.planted = true;
      this.emit('obst.grab', { player: v.id, target: 'ring', targetId: -1 });
    }
  }

  private kill(s: Slot, cause: ObstEvents['obst.death']['cause'], now: number) {
    const v = s.view;
    if (v.holding === 'player') {
      this.slots[s.carryId]!.view.carriedBy = -1;
      v.holding = 'none';
    }
    v.dead = true;
    v.planted = false;
    s.planted = false;
    s.respawnAt = now + 1.0;
    this.emit('obst.death', { player: v.id, cause });
    if (Number.isFinite(this.hud.lives)) this.hud.lives = Math.max(0, this.hud.lives - 1);
  }
  private respawn(s: Slot, via: 'checkpoint' | 'bubble') {
    const v = s.view,
      c = this.level.markers.checkpoint[this.lastCp - 1] ?? this.level.markers.spawn[0]!;
    if (via === 'checkpoint') {
      s.body.x = c.x * TILE + (TILE - PLAYER_W) / 2;
      s.body.y = (c.y + 1) * TILE - PLAYER_H;
      v.prevX = s.body.x;
      v.prevY = s.body.y;
    }
    s.body.vx = s.body.vy = 0;
    v.dead = false;
    v.bubble = null;
    v.invulnSec = BUBBLE_INVULN_SEC;
    this.emit('obst.respawn', { player: v.id, via });
  }
  private makeBubble(id: number) {
    const s = this.slots[id];
    if (!s || s.view.bubble || s.view.dead) return;
    if (s.view.holding === 'player') {
      this.slots[s.carryId]!.view.carriedBy = -1;
      s.view.holding = 'none';
    }
    s.view.bubble = { phase: 'fly', t: 0 };
    s.view.planted = false;
    s.planted = false;
    s.view.carriedBy = -1;
    this.emit('obst.bubble', { player: id, reason: 'offscreen' });
  }
  private stepBubble(s: Slot, now: number) {
    const v = s.view,
      b = v.bubble!;
    b.t += DT;
    if (b.phase === 'pop') {
      if (b.t >= BUBBLE_POP_SEC) this.respawn(s, 'bubble');
      return;
    }
    // fly to the median of the others by x (stub: the median player's current spot)
    const others = this.slots.filter((o) => o !== s && !o.view.dead && !o.view.bubble).sort((p, q) => p.body.x - q.body.x);
    const tgt = others[Math.floor((others.length - 1) / 2)];
    if (!tgt) return;
    const dx = tgt.body.x - s.body.x,
      dy = tgt.body.y - 20 - s.body.y,
      d = Math.hypot(dx, dy);
    const sp = BUBBLE_SPEED_TILES * TILE * DT;
    if (d <= sp + 6) {
      s.body.x = tgt.body.x;
      s.body.y = tgt.body.y - 20;
      b.phase = 'pop';
      b.t = 0;
      return;
    }
    s.body.x += (dx / d) * sp;
    s.body.y += (dy / d) * sp;
    s.body.vx = (dx / d) * 540;
    s.body.vy = (dy / d) * 540;
    void now;
  }

  private ropePass() {
    if (!this.ropeSet.length) return;
    for (let it = 0; it < 2; it++)
      for (const group of this.ropeSet)
        for (let k = 0; k + 1 < group.length; k++) {
          const A = this.slots[group[k]!]!,
            B = this.slots[group[k + 1]!]!;
          if (A.view.dead || B.view.dead || A.view.bubble || B.view.bubble || A.view.carriedBy >= 0 || B.view.carriedBy >= 0) continue;
          const ax = A.body.x + PLAYER_W / 2,
            ay = A.body.y + PLAYER_H / 2,
            bx = B.body.x + PLAYER_W / 2,
            by = B.body.y + PLAYER_H / 2;
          const dx = bx - ax,
            dy = by - ay,
            d = Math.hypot(dx, dy);
          if (d <= ROPE_LEN) continue;
          const exc = Math.min(24, d - ROPE_LEN);
          const ia = A.planted ? 1 / 8 : A.body.grounded ? 1 / 3 : 1,
            ib = B.planted ? 1 / 8 : B.body.grounded ? 1 / 3 : 1;
          this.nudge(A.body, (dx / d) * exc * (ia / (ia + ib)), (dy / d) * exc * (ia / (ia + ib)));
          this.nudge(B.body, (-dx / d) * exc * (ib / (ia + ib)), (-dy / d) * exc * (ib / (ia + ib)));
        }
  }
  private nudge(b: Body, dx: number, dy: number) {
    if (!boxHitsSolid(this.grid, b.x + dx, b.y + dy, PLAYER_W, PLAYER_H)) {
      b.x += dx;
      b.y += dy;
    } else if (!boxHitsSolid(this.grid, b.x + dx, b.y, PLAYER_W, PLAYER_H)) b.x += dx;
  }

  private pickups() {
    const now = this.timeSec;
    this.level.markers.star.forEach((c, i) => {
      const e = this.entities.find((q) => q.id === `star${i}`)!;
      if (e.on) return;
      const who = this.slots.find(
        (s) =>
          !s.view.dead &&
          !s.view.bubble &&
          Math.abs(s.body.x + PLAYER_W / 2 - (c.x + 0.5) * TILE) < 30 &&
          Math.abs(s.body.y + PLAYER_H / 2 - (c.y + 0.5) * TILE) < 36,
      );
      if (who) {
        e.on = true;
        this.hud.starsTaken++;
        this.emit('obst.star', { player: who.view.id, index: i, streak: 1 });
      }
    });
    this.level.markers.checkpoint.forEach((c, i) => {
      const e = this.entities.find((q) => q.id === `cp${i}`)!;
      if (e.on) return;
      const who = this.slots.find(
        (s) =>
          !s.view.dead &&
          !s.view.bubble &&
          Math.abs(s.body.x + PLAYER_W / 2 - (c.x + 0.5) * TILE) < 40 &&
          Math.abs(s.body.y + PLAYER_H / 2 - (c.y + 0.5) * TILE) < 40,
      );
      if (who) {
        e.on = true;
        this.lastCp = i + 1;
        this.emit('obst.checkpoint', { player: who.view.id, index: i });
      }
    });
    const g = this.level.markers.goal[0];
    if (g) {
      let inside = 0;
      for (const s of this.slots) {
        const was = s.view.inGoal;
        s.view.inGoal =
          !s.view.dead &&
          !s.view.bubble &&
          Math.abs(s.body.x + PLAYER_W / 2 - (g.x + 0.5) * TILE) < 56 &&
          Math.abs(s.body.y + PLAYER_H / 2 - (g.y + 0.5) * TILE) < 60;
        if (s.view.inGoal) inside++;
        if (s.view.inGoal && !was)
          this.emit('obst.goalEnter', { player: s.view.id, inside: this.slots.filter((o) => o.view.inGoal).length, total: this.n });
      }
      if (inside === this.n && !this.clear) {
        this.clear = true;
        this.emit('obst.levelClear', {
          level: this.level.def.id,
          timeSec: now,
          medal: now <= this.level.def.parSec ? 'gold' : 'silver',
          stars: this.hud.starsTaken,
          deaths: 0,
        });
      }
    }
  }

  private sync() {
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
  private refreshRopes() {
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

// ---- bots and keyboard for the harness
export function botController(opts: { idle?: ReadonlySet<number>; jumpyEvery?: number } = {}): Controller {
  const last = new Map<number, number>();
  return (i, w) => {
    if (opts.idle?.has(i)) return { move: 0, down: false, jump: false };
    const body = w.body(i),
      g = w.grid;
    const dir = 1;
    const ahead = (dx: number, dy: number) =>
      tileAt(g, Math.floor((body.x + PLAYER_W / 2 + dir * dx) / TILE), Math.floor((body.y + dy) / TILE));
    const wall = ahead(PLAYER_W / 2 + 10, PLAYER_H - 6) === T.Solid || ahead(PLAYER_W / 2 + 10, 6) === T.Solid;
    const noFloor = ahead(PLAYER_W / 2 + 18, PLAYER_H + 6) !== T.Solid && ahead(PLAYER_W / 2 + 18, PLAYER_H + 6) !== T.OneWay;
    const lastJ = last.get(i) ?? -99;
    const t = w.timeSec;
    let jump = false;
    if (body.grounded && (wall || noFloor || (opts.jumpyEvery && ((t * 60 + i * 7) | 0) % opts.jumpyEvery === 0)) && t - lastJ > 0.35) {
      jump = true;
      last.set(i, t);
    }
    return { move: 1, down: false, jump };
  };
}
