// Pure Overcooked-lite rules: no Phaser, no clock, no I/O. Units are tiles and milliseconds.
import { Emitter, type GameEvents } from './events';
import { FIXED_MAPS, MAP_H, MAP_W, isFloor, parseMap, spawnPoints, type Grid, type StationKind } from './maps';
import { DEFAULT_DIFFICULTY, params as difficultyParams, teamSize, type Difficulty, type Params } from './difficulty';

export const TICK_HZ = 60;
export const TICK_MS = 1000 / TICK_HZ;
export const SPEED = 4.5; // tiles/s at full deflection
export const RADIUS = 0.35;
export const REACH = 0.8; // probe distance from the player centre along the facing direction
export const REACH_SLACK = 0.3; // max gap between probe and a station tile

export type { StationKind } from './maps';
export type Item = 'raw0' | 'raw1' | 'cut0' | 'cut1' | 'plate' | 'dish';

export interface Station {
  kind: StationKind;
  tx: number;
  ty: number;
  crate: number; // ingredient type, crates only
  item: Item | null; // boards and counters
  progress: number; // 0..1: board cutting or pot cooking
  inputs: number[]; // pot: ingredient types inside
  done: boolean; // pot: dish ready
}
export interface Player {
  id: number;
  slot: number;
  x: number;
  y: number;
  fx: number; // facing, last non-null stick vector
  fy: number;
  item: Item | null;
  cutting: boolean;
  chopAt: number; // station index being chopped, -1 if none
}
export interface Order { id: number; expiresAt: number; warned: boolean }
export interface Controls { x: number; y: number; a: number; b: boolean } // a = new A presses since last tick
export const COLS = MAP_W;
export const ROWS = MAP_H;
export const MAX_SLOTS = 8;
export const COUNTDOWN_MS = 3000;
export const WARNING_MS = 10_000; // an order with less patience left than this raises orderWarning

export interface Game {
  bus: Emitter<GameEvents>;
  countdown: number; // ms before the round clock starts
  started: boolean;
  counting: boolean;
  endTick: number;
  grid: Grid;
  spawns: [number, number][];
  difficulty: Difficulty;
  n: number; // team size the parameters were scaled for
  params: Params;
  time: number;
  over: boolean;
  score: number;
  delivered: number;
  players: Map<number, Player>;
  stations: Station[];
  orders: Order[];
  nextOrderAt: number;
  orderSeq: number;
}

export const isSolid = (g: Game, tx: number, ty: number) => !isFloor(g.grid, tx, ty);

const spawnOrder = (g: Game) => {
  if (g.orders.length < g.params.maxOrders) {
    const o = { id: g.orderSeq++, expiresAt: g.time + g.params.orderTtlMs, warned: false };
    g.orders.push(o);
    g.bus.emit('orderNew', { order: o.id });
  }
};

export function createGame(opts: { difficulty?: Difficulty; n?: number; rows?: readonly string[]; countdownMs?: number; bus?: Emitter<GameEvents> } = {}): Game {
  const grid = parseMap(opts.rows ?? FIXED_MAPS[0]!.rows);
  const difficulty = opts.difficulty ?? DEFAULT_DIFFICULTY;
  const p = difficultyParams(difficulty, opts.n ?? 2);
  const stations: Station[] = [];
  grid.forEach((row, ty) => row.forEach((t, tx) => {
    if (t.kind === 'station') stations.push({ kind: t.station, tx, ty, crate: t.crate, item: null, progress: 0, inputs: [], done: false });
  }));
  const g: Game = { bus: opts.bus ?? new Emitter<GameEvents>(), countdown: opts.countdownMs ?? 0, started: false, counting: false, endTick: Infinity, grid, spawns: spawnPoints(grid, MAX_SLOTS), difficulty, n: teamSize(opts.n ?? 2), params: p, time: 0, over: false, score: 0, delivered: 0, players: new Map(), stations, orders: [], nextOrderAt: p.orderEveryMs, orderSeq: 0 };
  for (let i = 0; i < p.initialOrders; i++) spawnOrder(g);
  return g;
}

export function addPlayer(g: Game, id: number, slot: number) {
  if (g.players.has(id)) return;
  const [sx, sy] = g.spawns[slot % g.spawns.length] ?? [1, 1];
  g.players.set(id, { id, slot, x: sx + 0.5, y: sy + 0.5, fx: 0, fy: 1, item: null, cutting: false, chopAt: -1 });
}
export const removePlayer = (g: Game, id: number) => { g.players.delete(id); };

const blocked = (g: Game, x: number, y: number) => {
  for (let ty = Math.floor(y - RADIUS); ty <= Math.floor(y + RADIUS); ty++)
    for (let tx = Math.floor(x - RADIUS); tx <= Math.floor(x + RADIUS); tx++) if (isSolid(g, tx, ty)) return true;
  return false;
};

export function targetStation(g: Game, p: Player): Station | null {
  const len = Math.hypot(p.fx, p.fy) || 1;
  const px = p.x + (p.fx / len) * REACH;
  const py = p.y + (p.fy / len) * REACH;
  let best: Station | null = null;
  let bestD = REACH_SLACK;
  for (const s of g.stations) {
    const d = Math.hypot(px - Math.max(s.tx, Math.min(px, s.tx + 1)), py - Math.max(s.ty, Math.min(py, s.ty + 1)));
    if (d < bestD) { best = s; bestD = d; }
  }
  return best;
}

const cutOf = (i: Item): Item | null => (i === 'raw0' ? 'cut0' : i === 'raw1' ? 'cut1' : null);
const cutType = (i: Item | null) => (i === 'cut0' ? 0 : i === 'cut1' ? 1 : -1);

function interact(g: Game, p: Player, s: Station) {
  switch (s.kind) {
    case 'crate':
      if (!p.item) p.item = s.crate === 0 ? 'raw0' : 'raw1';
      break;
    case 'plates':
      if (!p.item) p.item = 'plate';
      break;
    case 'counter':
      if (p.item && !s.item) { s.item = p.item; p.item = null; }
      else if (!p.item && s.item) { p.item = s.item; s.item = null; }
      break;
    case 'board':
      if (p.item && !s.item && cutOf(p.item)) { s.item = p.item; s.progress = 0; p.item = null; }
      else if (!p.item && s.item) { p.item = s.item; s.item = null; s.progress = 0; }
      break;
    case 'pot': {
      const t = cutType(p.item);
      if (t >= 0 && !s.done && !s.inputs.includes(t) && s.inputs.length < 2) {
        s.inputs.push(t);
        s.progress = 0;
        p.item = null;
      } else if (p.item === 'plate' && s.done) {
        p.item = 'dish';
        s.done = false;
        s.inputs = [];
        s.progress = 0;
      }
      break;
    }
    case 'window':
      if (p.item === 'dish' && g.orders.length) {
        const o = g.orders.shift()!;
        const { reward, tipMax, orderTtlMs } = g.params;
        const tip = Math.round((tipMax * Math.max(0, o.expiresAt - g.time)) / orderTtlMs);
        g.score += reward + tip;
        g.delivered++;
        p.item = null;
        g.bus.emit('delivered', { player: p.id, points: reward + tip, tip });
      }
      break;
  }
}

// Runs one A press and reports what happened as events.
function act(g: Game, p: Player, s: Station) {
  const before = { held: p.item, shelf: s.item, inputs: s.inputs.length, done: s.done, delivered: g.delivered };
  interact(g, p, s);
  if (g.delivered !== before.delivered) return; // 'delivered' already emitted
  if (!before.held && p.item) g.bus.emit('itemPicked', { player: p.id, item: p.item, from: s.kind });
  else if (before.held && !p.item) g.bus.emit('itemDropped', { player: p.id, item: before.held, at: s.kind });
  else g.bus.emit('interactInvalid', { player: p.id });
  if (s.kind === 'pot' && before.inputs < 2 && s.inputs.length === 2) g.bus.emit('potStart', { station: g.stations.indexOf(s) });
}

function countdown(g: Game, dtMs: number) {
  const prev = Math.ceil(g.countdown / 1000);
  if (!g.counting) { g.counting = true; g.bus.emit('countdownTick', { n: prev, kind: 'start' }); }
  g.countdown = Math.max(0, g.countdown - dtMs);
  const now = Math.ceil(g.countdown / 1000);
  if (now !== prev) g.bus.emit('countdownTick', { n: now, kind: 'start' });
}

export function tick(g: Game, controls: Map<number, Controls>, dtMs = TICK_MS) {
  if (g.over) return;
  if (g.countdown > 0) { countdown(g, dtMs); return; }
  if (!g.started) { g.started = true; g.bus.emit('roundStart', {}); }
  const dt = dtMs / 1000;
  g.time += dtMs;

  for (const p of g.players.values()) {
    const c = controls.get(p.id) ?? { x: 0, y: 0, a: 0, b: false };
    const target = targetStation(g, p);
    const wasCutting = p.cutting;
    p.cutting = !!(c.b && target?.kind === 'board' && target.item && cutOf(target.item));
    const at = target ? g.stations.indexOf(target) : -1;
    if (wasCutting && (!p.cutting || at !== p.chopAt)) g.bus.emit('chopStop', { player: p.id, station: p.chopAt });
    if (p.cutting && (!wasCutting || at !== p.chopAt)) g.bus.emit('chopStart', { player: p.id, station: at });
    p.chopAt = p.cutting ? at : -1;
    if (p.cutting && target) {
      target.progress += dtMs / g.params.cutMs;
      if (target.progress >= 1) {
        target.item = cutOf(target.item!);
        target.progress = 0;
        g.bus.emit('chopDone', { player: p.id, station: at });
      }
    } else {
      if (c.x || c.y) { p.fx = c.x; p.fy = c.y; }
      const nx = p.x + c.x * SPEED * dt;
      if (!blocked(g, nx, p.y)) p.x = nx;
      const ny = p.y + c.y * SPEED * dt;
      if (!blocked(g, p.x, ny)) p.y = ny;
    }
    for (let i = 0; i < c.a; i++) {
      const s = targetStation(g, p);
      if (s) act(g, p, s);
    }
  }

  for (const s of g.stations) {
    if (s.kind === 'pot' && !s.done && s.inputs.length === 2) {
      s.progress += dtMs / g.params.cookMs;
      if (s.progress >= 1) { s.progress = 1; s.done = true; g.bus.emit('potReady', { station: g.stations.indexOf(s) }); }
    }
  }

  if (g.time >= g.nextOrderAt) {
    spawnOrder(g);
    g.nextOrderAt += g.params.orderEveryMs;
  }
  const alive = g.orders.filter((o) => o.expiresAt > g.time);
  for (const o of g.orders) if (!alive.includes(o)) g.bus.emit('orderExpired', { order: o.id });
  g.score = Math.max(0, g.score + (g.orders.length - alive.length) * g.params.penalty);
  g.orders = alive;
  for (const o of alive) if (!o.warned && o.expiresAt - g.time < WARNING_MS) { o.warned = true; g.bus.emit('orderWarning', { order: o.id }); }

  const left = Math.ceil((g.params.roundMs - g.time) / 1000);
  if (left <= 10 && left > 0 && left < g.endTick) { g.endTick = left; g.bus.emit('countdownTick', { n: left, kind: 'end' }); }
  if (g.time >= g.params.roundMs) { g.over = true; g.bus.emit('roundEnd', { score: g.score, delivered: g.delivered }); }
}
