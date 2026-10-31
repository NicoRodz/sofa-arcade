// Micro scenarios of the hazards measurement (tools/hazards/measure.ts): the ice crossing and the fire put out. Measurement tool: nothing in the game imports it.
import { TICK_MS, addPlayer, createGame, tick, type Controls } from '@pichi/game-pizzas/sim/overcooked';
import { fixedMap } from '@pichi/game-pizzas/sim/maps';
import { mulberry32 } from '@pichi/core/rng';
import { assignFire, chefControls, newFight } from './firefight';
import { newMem } from './mem';

const ICE_ROWS = [
  '##C1C2CKCKCOCOC#',
  '#.............↓#',
  'C..S......S.....',
  'C..iiiiiiiii..↓E',
  'P..iiiiiiiii..↓C',
  'C.→→→→→→→→→→→..C',
  'C......S.S.....C',
  '#..............#',
  '##CCCCCCCCCCCC##',
];
export interface IceRun { ms: number; overshoot: number; done: boolean }
/** A human crossing 4 ice tiles (from the centre of tile 3 to the centre of tile 7 in row 3) and stopping on the target: stick held, released at a guessed distance, then taps to correct. */
export function runIce(seed: number, difficulty: 'normal' | 'hard' | 'easy', opts: Record<string, unknown> = {}): IceRun {
  const r = mulberry32(seed * 7919 + 3);
  const g = createGame({ rows: ICE_ROWS, surfaces: true, countdownMs: 0, n: 2, difficulty, seed, ...opts });
  addPlayer(g, 1, 0);
  const p = g.players.get(1)!;
  Object.assign(p, { x: 3.5, y: 3.5, vx: 0, vy: 0 });
  const target = 7.5, release = 0.8 + 1.5 * r(), lag = Math.round((60 + 90 * r()) / TICK_MS);
  const q: Controls[] = Array.from({ length: lag }, () => ({ x: 0, y: 0, a: 0, b: false }));
  let released = false, pulse = 0, still = 0, maxX = p.x, t = 0;
  for (; t * TICK_MS < 25_000; t++) {
    const err = target - p.x;
    let sx = 0;
    if (!released) {
      sx = 1;
      if (err < release) released = true;
    }
    if (released) {
      if (pulse > 0) { sx = Math.sign(err); pulse--; }
      else if (Math.abs(p.vx) < 0.3 && Math.abs(err) > 0.5) pulse = 4; // stopped off target: a short tap towards it
      else if (p.vx * err < 0 && Math.abs(err) > 1.2 && Math.abs(p.vx) > 1.5) sx = Math.sign(err); // sliding away from it: push back
    }
    q.push({ x: sx, y: 0, a: 0, b: false });
    tick(g, new Map([[1, q.shift()!], [2, { x: 0, y: 0, a: 0, b: false }]]));
    maxX = Math.max(maxX, p.x);
    still = Math.abs(target - p.x) < 0.5 && Math.abs(p.vx) < 0.3 ? still + 1 : 0;
    if (still * TICK_MS >= 300) return { ms: t * TICK_MS, overshoot: Math.max(0, maxX - target), done: true };
  }
  return { ms: t * TICK_MS, overshoot: Math.max(0, maxX - target), done: false };
}

export interface FireRun { big: boolean; outMs: number; endMs: number; resolved: boolean }
/** A pizza left in the oven of `mapId` burns and starts a fire; `n` chefs (1 or 2) put it out. Times from fire:start. */
export function runFire(mapId: string, n: number, seed: number, difficulty: 'normal' | 'hard' = 'normal', opts: Record<string, unknown> = {}): FireRun | null {
  const map = fixedMap(mapId)!;
  const g = createGame({ mapId, rows: map.rows, spawns: map.spawns, difficulty, n, seed, countdownMs: 0, burn: true, fire: true, ...opts });
  const ids = Array.from({ length: n }, (_v, i) => i + 1);
  ids.forEach((id, rank) => addPlayer(g, id, rank, rank));
  const oven = g.stations.find((s) => s.kind === 'pot')!;
  Object.assign(oven, { inputs: [0, 1], progress: 1, done: true, readyAt: 0 });
  const fight = newFight(), mem = new Map(ids.map((id) => [id, newMem()]));
  let startAt = -1, outAt = -1, endAt = -1, big = false;
  g.bus.on('fire:start', (e) => { startAt = g.time; big = !!e.big; });
  g.bus.on('fire:out', () => { if (outAt < 0) outAt = g.time; });
  g.bus.on('fire:end', () => { endAt = g.time; });
  for (let t = 0; t * TICK_MS < 60_000 && endAt < 0; t++) {
    const plan = startAt >= 0 ? assignFire(g, fight) : new Map();
    const c = new Map<number, Controls>();
    ids.forEach((id, rank) => c.set(id, chefControls(g, g.players.get(id)!, rank, mem.get(id)!, t, plan.get(id))));
    tick(g, c);
  }
  if (startAt < 0) return null;
  return { big, outMs: outAt < 0 ? Infinity : outAt - startAt, endMs: endAt < 0 ? Infinity : endAt - startAt, resolved: endAt >= 0 };
}
