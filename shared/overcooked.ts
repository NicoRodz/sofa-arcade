// Pure Overcooked-lite rules: no Phaser, no clock, no I/O. Units are tiles and milliseconds.
import { Emitter, type GameEvents } from './events';
import { FIXED_MAPS, MAP_H, MAP_W, isFloor, parseMap, spawnPoints, type Grid, type StationKind } from './maps';
import { DEFAULT_DIFFICULTY, DIRTY_MS, WASH_MS, params as difficultyParams, teamSize, type Difficulty, type Params } from './difficulty';
import { mulberry32, type Rng } from './rng';

export const TICK_HZ = 60;
export const TICK_MS = 1000 / TICK_HZ;
export const SPEED = 4.5; // tiles/s at full deflection
export const RADIUS = 0.35;
export const REACH = 0.8; // probe distance from the player centre along the facing direction
export const REACH_SLACK = 0.3; // max gap between probe and a station tile

export type { StationKind } from './maps';
// raw2/cut2 = cheese (Margarita). dishQ = a pizza that baked with cheese.
export type Item = 'raw0' | 'raw1' | 'raw2' | 'cut0' | 'cut1' | 'cut2' | 'plate' | 'dish' | 'dishQ' | 'dirty';
export type Recipe = 'marinara' | 'margarita';
export const RAW_OF: readonly Item[] = ['raw0', 'raw1', 'raw2'];

export interface Station {
  kind: StationKind;
  tx: number;
  ty: number;
  crate: number; // ingredient type, crates only
  item: Item | null; // boards and counters
  progress: number; // 0..1: board cutting or pot cooking
  inputs: number[]; // pot: ingredient types inside (0 dough, 1 tomato, 2 cheese)
  done: boolean; // pot: dish ready
  count: number; // plates: clean stock (finite-plate maps); dirty (return): dirty plates waiting; sink: dirty plates to wash
  clean: number; // sink: washed plates ready to take
}
export interface Player {
  id: number;
  slot: number;
  spawn: number; // index into game.spawns where this chef started (puesto i belongs to spawn i)
  x: number;
  y: number;
  fx: number; // facing, last non-null stick vector
  fy: number;
  vx: number; // R1: smoothed velocity, tiles/s
  vy: number;
  item: Item | null;
  cutting: boolean;
  chopAt: number; // station index being chopped, -1 if none
}
export interface Order { id: number; expiresAt: number; warned: boolean; recipe: Recipe }
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
  rng: Rng; // seeded: which orders are Margarita
  hasCheese: boolean;
  finitePlates: boolean; // the map has a dirty-plate return and a sink: plates run out unless somebody washes
  dirtyDue: number[]; // game times at which a delivered plate comes back dirty
  nextOrderAt: number;
  orderSeq: number;
}

export const isSolid = (g: Game, tx: number, ty: number) => !isFloor(g.grid, tx, ty);

export const spawnOrder = (g: Game) => {
  if (g.orders.length < g.params.maxOrders) {
    const recipe: Recipe = g.hasCheese && g.rng() * 100 < g.params.cheesePct ? 'margarita' : 'marinara';
    const o: Order = { id: g.orderSeq++, expiresAt: g.time + g.params.orderTtlMs, warned: false, recipe };
    g.orders.push(o);
    g.bus.emit('orderNew', { order: o.id, recipe });
  }
};

export function createGame(opts: { difficulty?: Difficulty; n?: number; rows?: readonly string[]; spawns?: readonly [number, number][]; seed?: number; countdownMs?: number; bus?: Emitter<GameEvents> } = {}): Game {
  const grid = parseMap(opts.rows ?? FIXED_MAPS[0]!.rows);
  const difficulty = opts.difficulty ?? DEFAULT_DIFFICULTY;
  const p = difficultyParams(difficulty, opts.n ?? 2);
  const stations: Station[] = [];
  grid.forEach((row, ty) => row.forEach((t, tx) => {
    if (t.kind === 'station') stations.push({ kind: t.station, tx, ty, crate: t.crate, item: null, progress: 0, inputs: [], done: false, count: 0, clean: 0 });
  }));
  const g: Game = { bus: opts.bus ?? new Emitter<GameEvents>(), countdown: opts.countdownMs ?? 0, started: false, counting: false, endTick: Infinity, grid, spawns: spawnPoints(grid, MAX_SLOTS, opts.spawns), difficulty, n: teamSize(opts.n ?? 2), params: p, time: 0, over: false, score: 0, delivered: 0, players: new Map(), stations, orders: [], rng: mulberry32(opts.seed ?? 1), hasCheese: stations.some((s) => s.kind === 'crate' && s.crate === 2), finitePlates: stations.some((s) => s.kind === 'dirty') && stations.some((s) => s.kind === 'sink'), dirtyDue: [], nextOrderAt: p.orderEveryMs, orderSeq: 0 };
  if (g.finitePlates) {
    const piles = stations.filter((s) => s.kind === 'plates');
    for (let i = 0; i < p.plates && piles.length; i++) piles[i % piles.length]!.count++;
  }
  for (let i = 0; i < p.initialOrders; i++) spawnOrder(g);
  return g;
}

// `slot` picks the chef (colour); `spawn` the start tile (default: the same index). The screen passes the chef's rank so
// spawn i always holds the i-th chef and the puesto table (spawn i = puesto i) lines up even when slots have gaps.
export function addPlayer(g: Game, id: number, slot: number, spawn = slot) {
  if (g.players.has(id)) return;
  const [sx, sy] = g.spawns[spawn % g.spawns.length] ?? [1, 1];
  g.players.set(id, { id, slot, spawn: spawn % g.spawns.length, x: sx + 0.5, y: sy + 0.5, fx: 0, fy: 1, vx: 0, vy: 0, item: null, cutting: false, chopAt: -1 });
}
export const removePlayer = (g: Game, id: number) => { g.players.delete(id); };

// R1: one integrator for the chef's velocity, v += (target - v) * (1 - e^(-dt/tau)). tau = 0 is "instant" (the old feel).
function steer(p: Player, c: Controls, g: Game, dtMs: number) {
  const { tauMs, tauStopMs } = g.params.tune;
  const moving = c.x !== 0 || c.y !== 0;
  const tau = moving ? tauMs : tauStopMs;
  const k = tau > 0 ? 1 - Math.exp(-dtMs / tau) : 1;
  p.vx += (c.x * SPEED - p.vx) * k;
  p.vy += (c.y * SPEED - p.vy) * k;
  if (!moving && Math.hypot(p.vx, p.vy) < 0.02) { p.vx = 0; p.vy = 0; } // the tail of the exponential is a stop
}

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

const cutOf = (i: Item): Item | null => (i === 'raw0' ? 'cut0' : i === 'raw1' ? 'cut1' : i === 'raw2' ? 'cut2' : null);
const cutType = (i: Item | null) => (i === 'cut0' ? 0 : i === 'cut1' ? 1 : i === 'cut2' ? 2 : -1);
// A pizza cooks once it has dough and tomato; cheese can still go on until it is done (then it is a Margarita).
const baked = (s: Station) => s.inputs.includes(0) && s.inputs.includes(1);

function interact(g: Game, p: Player, s: Station) {
  switch (s.kind) {
    case 'crate':
      if (!p.item) p.item = RAW_OF[s.crate] ?? 'raw1';
      break;
    case 'plates':
      if (!g.finitePlates) { if (!p.item) p.item = 'plate'; }
      else if (!p.item) { if (s.count > 0) { s.count--; p.item = 'plate'; } }
      else if (p.item === 'plate') { s.count++; p.item = null; } // put a clean plate back on the pile
      break;
    case 'dirty': // return window: take one dirty plate
      if (!p.item && s.count > 0) { s.count--; p.item = 'dirty'; }
      break;
    case 'sink':
      if (p.item === 'dirty') { s.count++; p.item = null; }
      else if (p.item === 'plate') { s.clean++; p.item = null; } // the sink also works as a pile of clean plates
      else if (!p.item && s.clean > 0) { s.clean--; p.item = 'plate'; }
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
      if (t >= 0 && !s.done && !s.inputs.includes(t) && s.inputs.length < 3) {
        s.inputs.push(t);
        if (!baked(s)) s.progress = 0;
        p.item = null;
      } else if (p.item === 'plate' && s.done) {
        p.item = s.inputs.includes(2) ? 'dishQ' : 'dish';
        s.done = false;
        s.inputs = [];
        s.progress = 0;
      }
      break;
    }
    case 'trash':
      if (g.finitePlates && (p.item === 'plate' || p.item === 'dirty')) break; // plates are not rubbish: they would be lost for good
      if (g.finitePlates && (p.item === 'dish' || p.item === 'dishQ')) g.dirtyDue.push(g.time + DIRTY_MS); // the plate under the pizza comes back
      p.item = null;
      break;
    case 'window':
      if ((p.item === 'dish' || p.item === 'dishQ') && g.orders.length) {
        // the order that asked for this pizza; a Margarita also satisfies a Marinara order, never the other way round
        const want: Recipe = p.item === 'dishQ' ? 'margarita' : 'marinara';
        let at = g.orders.findIndex((o) => o.recipe === want);
        if (at < 0 && p.item === 'dishQ') at = 0;
        if (at < 0) break;
        const o = g.orders.splice(at, 1)[0]!;
        const { reward, tipMax, orderTtlMs } = g.params;
        const tip = Math.round((tipMax * Math.max(0, o.expiresAt - g.time)) / orderTtlMs);
        g.score += reward + tip;
        g.delivered++;
        if (g.finitePlates) g.dirtyDue.push(g.time + DIRTY_MS);
        p.item = null;
        g.bus.emit('delivered', { player: p.id, points: reward + tip, tip });
      }
      break;
  }
}

// Runs one A press and reports what happened as events.
function act(g: Game, p: Player, s: Station) {
  const before = { held: p.item, shelf: s.item, baked: baked(s), done: s.done, delivered: g.delivered };
  interact(g, p, s);
  if (g.delivered !== before.delivered) return; // 'delivered' already emitted
  if (!before.held && p.item) g.bus.emit('itemPicked', { player: p.id, item: p.item, from: s.kind });
  else if (before.held && !p.item) g.bus.emit('itemDropped', { player: p.id, item: before.held, at: s.kind });
  else g.bus.emit('interactInvalid', { player: p.id });
  if (s.kind === 'pot' && !before.baked && baked(s)) g.bus.emit('potStart', { station: g.stations.indexOf(s) });
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
    // B held: cut / grate / stretch on a board with a raw item, or scrub plates at a sink with dirty ones
    p.cutting = !!(c.b && target && ((target.kind === 'board' && target.item && cutOf(target.item)) || (target.kind === 'sink' && target.count > 0)));
    const at = target ? g.stations.indexOf(target) : -1;
    const wasAt = p.chopAt;
    if (wasCutting && (!p.cutting || at !== wasAt)) g.bus.emit(g.stations[wasAt]?.kind === 'sink' ? 'washStop' : 'chopStop', { player: p.id, station: wasAt });
    if (p.cutting && (!wasCutting || at !== wasAt)) g.bus.emit(target!.kind === 'sink' ? 'washStart' : 'chopStart', { player: p.id, station: at });
    p.chopAt = p.cutting ? at : -1;
    if (p.cutting) { p.vx = 0; p.vy = 0; }
    if (p.cutting && target?.kind === 'sink') {
      target.progress += dtMs / WASH_MS;
      if (target.progress >= 1) {
        target.count--; target.clean++;
        target.progress = 0;
        g.bus.emit('washDone', { player: p.id, station: at });
      }
    } else if (p.cutting && target) {
      target.progress += dtMs / g.params.cutMs;
      if (target.progress >= 1) {
        target.item = cutOf(target.item!);
        target.progress = 0;
        g.bus.emit('chopDone', { player: p.id, station: at });
      }
    } else {
      if (c.x || c.y) { p.fx = c.x; p.fy = c.y; }
      steer(p, c, g, dtMs);
      const nx = p.x + p.vx * dt;
      if (!blocked(g, nx, p.y)) p.x = nx; else p.vx = 0;
      const ny = p.y + p.vy * dt;
      if (!blocked(g, p.x, ny)) p.y = ny; else p.vy = 0;
    }
    for (let i = 0; i < c.a; i++) {
      const s = targetStation(g, p);
      if (s) act(g, p, s);
    }
  }

  for (const s of g.stations) {
    if (s.kind === 'pot' && !s.done && baked(s)) {
      s.progress += dtMs / g.params.cookMs;
      if (s.progress >= 1) { s.progress = 1; s.done = true; g.bus.emit('potReady', { station: g.stations.indexOf(s) }); }
    }
  }

  while (g.dirtyDue.length && g.dirtyDue[0]! <= g.time) { // delivered plates come back dirty
    g.dirtyDue.shift();
    const back = g.stations.filter((s) => s.kind === 'dirty').sort((a, b) => a.count - b.count)[0];
    if (back) { back.count++; g.bus.emit('dirtyNew', { station: g.stations.indexOf(back) }); }
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
