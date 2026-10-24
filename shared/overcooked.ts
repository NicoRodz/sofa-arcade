// Pure Overcooked-lite rules: no Phaser, no clock, no I/O. Units are tiles and milliseconds.
import { Emitter, type GameEvents } from './events';
import { FIXED_MAPS, MAP_H, MAP_W, isFloor, parseMap, spawnPoints, type Grid, type StationKind } from './maps';
import { DEFAULT_DIFFICULTY, DIRTY_MS, WASH_MS, params as difficultyParams, teamSize, type Difficulty, type Params, type Tuning } from './difficulty';
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

// R13: what a recipe is worth before the tip: points per ingredient plus points per process (stretch or cut each one, then bake).
// Marinara = dough, tomato (2 ingredients) + stretch, cut, bake (3 processes). Margarita adds cheese and grating.
export const RECIPE_PARTS: Record<Recipe, { components: number; processes: number }> = { marinara: { components: 2, processes: 3 }, margarita: { components: 3, processes: 4 } };
export const recipeBase = (r: Recipe, t: Tuning) => RECIPE_PARTS[r].components * t.baseComponent + RECIPE_PARTS[r].processes * t.baseProcess;
// R15: the tip multiplier for a delivery made after `streak` correct ones in a row.
export const tipMultiplier = (streak: number, t: Tuning) => Math.min(t.streakMax, 1 + Math.max(0, streak));

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
  bHeld: boolean; // B as of the previous tick: a rising edge with empty hands and no station in front is a dash (R2)
  dashMs: number; // time left in the running dash
  dashCd: number; // time until the next dash
  dashDx: number; // dash direction (unit vector)
  dashDy: number;
  dashHit: number[]; // chefs this dash already pushed (R5): one push each
  kx: number; // R5: knock velocity from a dash that hit this chef, tiles/s, fades out
  ky: number;
  buffA: number; // R6: A presses waiting for a station to show up in front
  buffAge: number; // ms since the newest of them
  buffB: number; // R6: ms left of a dash press that found nothing to do yet
  crossing: boolean; // R4: in a pair that is crossing through each other (slower, drawn see-through)
}
export interface Order { id: number; expiresAt: number; warned: boolean; recipe: Recipe }
// a = new A presses since last tick; bTaps = new B presses since last tick (a quick tap can start and end between two ticks)
export interface Controls { x: number; y: number; a: number; b: boolean; bTaps?: number }
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
  mapId?: string; // fixed map id, for the star table (undefined: generated map)
  streak: number; // R15: correct deliveries in a row; an expired order or a rejected dish resets it
  bestStreak: number;
  tips: number; // points earned as tips, for the results
  expired: number;
  rejected: number;
  players: Map<number, Player>;
  stations: Station[];
  orders: Order[];
  rng: Rng; // seeded: which orders are Margarita
  hasCheese: boolean;
  finitePlates: boolean; // the map has a dirty-plate return and a sink: plates run out unless somebody washes
  crowd: Map<string, { ms: number; ghost: boolean }>; // R4: per pair of chefs, ms of opposed pushing and whether they are crossing
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

export function createGame(opts: { mapId?: string; difficulty?: Difficulty; n?: number; rows?: readonly string[]; spawns?: readonly [number, number][]; seed?: number; countdownMs?: number; bus?: Emitter<GameEvents> } = {}): Game {
  const grid = parseMap(opts.rows ?? FIXED_MAPS[0]!.rows);
  const difficulty = opts.difficulty ?? DEFAULT_DIFFICULTY;
  const p = difficultyParams(difficulty, opts.n ?? 2);
  const stations: Station[] = [];
  grid.forEach((row, ty) => row.forEach((t, tx) => {
    if (t.kind === 'station') stations.push({ kind: t.station, tx, ty, crate: t.crate, item: null, progress: 0, inputs: [], done: false, count: 0, clean: 0 });
  }));
  const g: Game = { bus: opts.bus ?? new Emitter<GameEvents>(), countdown: opts.countdownMs ?? 0, started: false, counting: false, endTick: Infinity, grid, spawns: spawnPoints(grid, MAX_SLOTS, opts.spawns), difficulty, n: teamSize(opts.n ?? 2), params: p, time: 0, over: false, score: 0, delivered: 0, mapId: opts.mapId, streak: 0, bestStreak: 0, tips: 0, expired: 0, rejected: 0, players: new Map(), stations, orders: [], rng: mulberry32(opts.seed ?? 1), hasCheese: stations.some((s) => s.kind === 'crate' && s.crate === 2), finitePlates: stations.some((s) => s.kind === 'dirty') && stations.some((s) => s.kind === 'sink'), crowd: new Map(), dirtyDue: [], nextOrderAt: p.orderEveryMs, orderSeq: 0 };
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
  g.players.set(id, { id, slot, spawn: spawn % g.spawns.length, x: sx + 0.5, y: sy + 0.5, fx: 0, fy: 1, vx: 0, vy: 0, item: null, cutting: false, chopAt: -1, bHeld: false, dashMs: 0, dashCd: 0, dashDx: 0, dashDy: 0, dashHit: [], kx: 0, ky: 0, buffA: 0, buffAge: 0, buffB: 0, crossing: false });
}
export const removePlayer = (g: Game, id: number) => {
  g.players.delete(id);
  for (const k of [...g.crowd.keys()]) if (k.split(':').includes(String(id))) g.crowd.delete(k);
};

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

const KNOCK_FADE_MS = 90; // R5: the push a dash gives fades with this time constant
const idleControls: Controls = { x: 0, y: 0, a: 0, b: false };
const unit = (x: number, y: number): [number, number] => { const l = Math.hypot(x, y) || 1; return [x / l, y / l]; };

// R2 (phase 1: no third button): B pressed with empty hands and no station in front. Returns true when the dash started.
function startDash(g: Game, p: Player, c: Controls) {
  const [dx, dy] = unit(c.x || c.y ? c.x : p.fx, c.x || c.y ? c.y : p.fy);
  const { dashMs, dashCdMs } = g.params.tune;
  p.dashMs = dashMs; p.dashCd = dashCdMs; p.dashDx = dx; p.dashDy = dy; p.dashHit = [];
  p.fx = dx; p.fy = dy;
  g.bus.emit('dash', { player: p.id, dx, dy });
}

// R5: a dash that touches another chef gives it a short push; it never makes it drop what it carries.
function pushNeighbours(g: Game, p: Player) {
  for (const o of g.players.values()) {
    if (o.id === p.id || p.dashHit.includes(o.id) || Math.hypot(o.x - p.x, o.y - p.y) > 2 * RADIUS + 0.1) continue;
    p.dashHit.push(o.id);
    if (!o.cutting) { o.kx += p.dashDx * g.params.tune.pushSpeed; o.ky += p.dashDy * g.params.tune.pushSpeed; }
    g.bus.emit('bump', { player: p.id, other: o.id });
  }
}

// Moves a chef along (ux, uy) up to `amt`, axis by axis so a wall only stops the component that hits it. Returns the distance gained.
function moveAway(g: Game, p: Player, ux: number, uy: number, amt: number): number {
  const ox = p.x, oy = p.y;
  if (!blocked(g, p.x + ux * amt, p.y)) p.x += ux * amt;
  if (!blocked(g, p.x, p.y + uy * amt)) p.y += uy * amt;
  return (p.x - ox) * ux + (p.y - oy) * uy;
}
// Is chef `a` (with stick c) pushing towards chef `b`?
const pushing = (a: Player, b: Player, c: Controls) => {
  const m = Math.hypot(c.x, c.y);
  if (m < 0.2) return false;
  const [ux, uy] = unit(b.x - a.x, b.y - a.y);
  return (c.x * ux + c.y * uy) / m > 0.3;
};

// R4 soft collision: chefs are circles of RADIUS. Overlapping chefs are pushed apart (one who is cutting does not give way).
// If two push against each other, or one pushes one who cannot give way, for yieldAfterMs, the pair crosses through each
// other at yieldSpeed until they are clear: with 8 chefs in a one-tile corridor nobody stays stuck.
function separate(g: Game, controls: Map<number, Controls>, dtMs: number) {
  const list = [...g.players.values()];
  for (const p of list) p.crossing = false;
  const { yieldAfterMs } = g.params.tune;
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    const a = list[i]!, b = list[j]!;
    const key = a.id < b.id ? `${a.id}:${b.id}` : `${b.id}:${a.id}`;
    let st = g.crowd.get(key);
    const dx = a.x - b.x, dy = a.y - b.y, d = Math.hypot(dx, dy), min = 2 * RADIUS;
    const ca = controls.get(a.id) ?? idleControls, cb = controls.get(b.id) ?? idleControls;
    if (st?.ghost) {
      const still = Math.hypot(ca.x, ca.y) < 0.2 && Math.hypot(cb.x, cb.y) < 0.2;
      if (d >= min + 0.05 || (still && d < min)) g.crowd.delete(key); // clear, or both stopped halfway: solid again, they get pushed apart
      else { a.crossing = true; b.crossing = true; continue; }
      st = undefined;
    }
    if (d >= min) {
      if (st) { st.ms = Math.max(0, st.ms - dtMs); if (st.ms === 0) g.crowd.delete(key); }
      continue;
    }
    const [ux, uy] = d > 1e-6 ? [dx / d, dy / d] : [a.id < b.id ? 1 : -1, 0]; // from b towards a
    const overlap = min - d;
    const wa = a.cutting ? 0 : b.cutting ? 1 : 0.5;
    let moved = 0;
    if (wa > 0) moved += moveAway(g, a, ux, uy, overlap * wa);
    if (wa < 1) moved += moveAway(g, b, -ux, -uy, overlap * (1 - wa) + (overlap * wa - moved));
    if (wa > 0 && wa < 1 && overlap - moved > 1e-3) moved += moveAway(g, a, ux, uy, overlap - moved);
    const stuck = overlap - moved > 1e-3 || wa === 0 || wa === 1; // nobody gave way: a wall, or a chef who is cutting
    const pa = pushing(a, b, ca), pb = pushing(b, a, cb);
    if ((pa && pb) || (stuck && (pa || pb))) {
      st ??= { ms: 0, ghost: false };
      st.ms += dtMs;
      if (st.ms >= yieldAfterMs) { st.ghost = true; a.crossing = true; b.crossing = true; }
      g.crowd.set(key, st);
    } else if (st) { st.ms = Math.max(0, st.ms - dtMs); if (st.ms === 0) g.crowd.delete(key); }
  }
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
        if (at < 0) { // R16: the wrong plate is refused, goes back dirty and pays nothing
          if (g.finitePlates) g.dirtyDue.push(g.time + DIRTY_MS);
          p.item = null;
          g.rejected++;
          resetStreak(g);
          g.bus.emit('dishRejected', { player: p.id });
          break;
        }
        const o = g.orders.splice(at, 1)[0]!;
        const { tune, orderTtlMs } = g.params;
        const base = recipeBase(o.recipe, tune); // R13
        const left = Math.min(1, Math.max(0, o.expiresAt - g.time) / orderTtlMs);
        const mult = tipMultiplier(g.streak, tune); // R15: the streak multiplies only the tip
        const tip = Math.round(base * tune.tipPct * left) * mult; // R14: up to +50% of the base, by the patience left
        g.score += base + tip;
        g.tips += tip;
        g.delivered++;
        g.streak++;
        g.bestStreak = Math.max(g.bestStreak, g.streak);
        if (g.finitePlates) g.dirtyDue.push(g.time + DIRTY_MS);
        p.item = null;
        g.bus.emit('delivered', { player: p.id, points: base + tip, tip, base, mult });
        g.bus.emit('streak', { n: g.streak, mult: tipMultiplier(g.streak, tune) });
      }
      break;
  }
}

function resetStreak(g: Game) {
  if (g.streak === 0) return;
  g.streak = 0;
  g.bus.emit('streak', { n: 0, mult: 1 });
}

// Runs one A press and reports what happened as events.
function act(g: Game, p: Player, s: Station) {
  const before = { held: p.item, shelf: s.item, baked: baked(s), done: s.done, delivered: g.delivered, rejected: g.rejected };
  interact(g, p, s);
  if (g.delivered !== before.delivered || g.rejected !== before.rejected) return; // 'delivered' or 'dishRejected' already emitted
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
    const c = controls.get(p.id) ?? idleControls;
    const tune = g.params.tune;
    const target = targetStation(g, p);
    p.dashCd = Math.max(0, p.dashCd - dtMs);
    const bEdge = (c.b && !p.bHeld) || (c.bTaps ?? 0) > 0;
    p.bHeld = c.b;
    const wasCutting = p.cutting;
    // B held: cut / grate / stretch on a board with a raw item, or scrub plates at a sink with dirty ones
    p.cutting = !!(c.b && target && ((target.kind === 'board' && target.item && cutOf(target.item)) || (target.kind === 'sink' && target.count > 0)));
    const at = target ? g.stations.indexOf(target) : -1;
    const wasAt = p.chopAt;
    if (wasCutting && (!p.cutting || at !== wasAt)) g.bus.emit(g.stations[wasAt]?.kind === 'sink' ? 'washStop' : 'chopStop', { player: p.id, station: wasAt });
    if (p.cutting && (!wasCutting || at !== wasAt)) g.bus.emit(target!.kind === 'sink' ? 'washStart' : 'chopStart', { player: p.id, station: at });
    p.chopAt = p.cutting ? at : -1;
    if (p.cutting) { p.vx = 0; p.vy = 0; p.kx = 0; p.ky = 0; p.dashMs = 0; }
    // R2 + R6: a B press with free hands and nothing in front is a dash; if the cooldown ends within bufferMs it still goes
    const free = !p.item && !target && !p.cutting;
    const ready = p.dashMs <= 0 && p.dashCd <= 0;
    if (!free) p.buffB = 0;
    else if (bEdge && ready) startDash(g, p, c);
    else if (bEdge) p.buffB = tune.bufferMs;
    else if (p.buffB > 0 && ready) { startDash(g, p, c); p.buffB = 0; }
    else p.buffB = Math.max(0, p.buffB - dtMs);
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
      if (p.dashMs > 0) {
        const v = SPEED * g.params.tune.dashMult;
        p.vx = p.dashDx * v; p.vy = p.dashDy * v;
        p.dashMs = Math.max(0, p.dashMs - dtMs);
        if (p.dashMs <= 0) { p.vx = p.dashDx * SPEED; p.vy = p.dashDy * SPEED; } // back to walking pace; R1 takes it from there
      } else steer(p, c, g, dtMs);
      const slow = p.crossing ? g.params.tune.yieldSpeed : 1;
      const nx = p.x + (p.vx + p.kx) * dt * slow;
      if (!blocked(g, nx, p.y)) p.x = nx; else { p.vx = 0; p.kx = 0; }
      const ny = p.y + (p.vy + p.ky) * dt * slow;
      if (!blocked(g, p.x, ny)) p.y = ny; else { p.vy = 0; p.ky = 0; }
      const fade = Math.exp(-dtMs / KNOCK_FADE_MS);
      p.kx = Math.abs(p.kx) < 0.02 ? 0 : p.kx * fade;
      p.ky = Math.abs(p.ky) < 0.02 ? 0 : p.ky * fade;
      if (p.dashMs > 0) pushNeighbours(g, p);
    }
    // R6: an A press with no station in front waits bufferMs for one to show up
    if (c.a > 0) { p.buffA += c.a; p.buffAge = 0; }
    while (p.buffA > 0) {
      const s = targetStation(g, p);
      if (!s) break;
      p.buffA--;
      act(g, p, s);
    }
    if (p.buffA > 0) { p.buffAge += dtMs; if (p.buffAge > tune.bufferMs) p.buffA = 0; }
  }

  separate(g, controls, dtMs);

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
  const lost = g.orders.length - alive.length;
  g.score = Math.max(0, g.score + lost * g.params.penalty);
  if (lost) { g.expired += lost; resetStreak(g); }
  g.orders = alive;
  for (const o of alive) if (!o.warned && o.expiresAt - g.time < WARNING_MS) { o.warned = true; g.bus.emit('orderWarning', { order: o.id }); }

  const left = Math.ceil((g.params.roundMs - g.time) / 1000);
  if (left <= 10 && left > 0 && left < g.endTick) { g.endTick = left; g.bus.emit('countdownTick', { n: left, kind: 'end' }); }
  if (g.time >= g.params.roundMs) { g.over = true; g.bus.emit('roundEnd', { score: g.score, delivered: g.delivered }); }
}
