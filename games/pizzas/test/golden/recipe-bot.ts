// Scripted chefs for the Carta del día (test support: nothing in the game imports this). Same engine, same controls as golden/bot.ts, but each chef makes the recipe
// the queue asks for: Marinara, Margarita / Pepperoni / Champiñón (a topping: crate 2, board, oven) and the Calzone (fold at the oven: hold Picar until it is folded).
// A chef picks the recipe at the start of each pizza: `force`, else the recipe of the order at its rank in its team's queue (rank % queue length), else Marinara.
// It reads only what the mirrored view of the versus proofs carries (grid, stations, time, teams, rec), so the proof of the mirror runs it unchanged.
import { COUNTDOWN_MS, TICK_MS, addPlayer, createGame, targetStation, tick, type Controls, type Game, type Item, type Player, type Station } from '../../sim/overcooked';
import { fixedMap } from '../../sim/maps';
import type { Difficulty } from '@pichi/core/difficulty';
import { RECIPE_DEFS, isDish, type Recipe } from '../../sim/recipes/defs';
import { RecBus, route, stationsOf, type Mem } from './bot';

type At = 'crate0' | 'crate1' | 'crate2' | 'crate3' | 'crate4' | 'board' | 'pot' | 'plates' | 'window';
type Take = 'a' | 'chop' | 'fold' | 'serve';
interface Step { at: At; take: Take; done: (g: Game, p: Player, s: Station) => boolean }
export interface RMem extends Mem { recipe: Recipe | null; force?: Recipe }
export const newMem = (force?: Recipe): RMem => ({ step: 0, since: 0, lastPress: -99, bin: false, recipe: null, ...(force ? { force } : {}) });

const cut = (p: Player) => !!p.item && p.item.startsWith('cut');
// crate -> board (put it down, hold Picar until it is cut, take it) -> oven
const prepare = (crate: At, raw: Item): Step[] => [
  { at: crate, take: 'a', done: (_g, p) => p.item === raw },
  { at: 'board', take: 'a', done: (_g, p) => !p.item },
  { at: 'board', take: 'chop', done: (_g, _p, s) => !!s.item && s.item.startsWith('cut') },
  { at: 'board', take: 'a', done: (_g, p) => cut(p) },
  { at: 'pot', take: 'a', done: (_g, p) => !p.item },
];
// dough first, then the topping (the oven does not start until dough AND tomato are in), then the tomato (it starts the baking), then fold (calzone only)
export const stepsFor = (recipe: Recipe): Step[] => {
  const top = RECIPE_DEFS[recipe].topping;
  const two = RECIPE_DEFS[recipe].toppings;
  return [
    ...prepare('crate0', 'raw0'),
    ...(top !== null ? prepare('crate2', `raw${top}` as Item) : []),
    ...(two ? [...prepare('crate2', `raw${two[0]}` as Item), ...prepare('crate3', `raw${two[1]}` as Item)] : []), // a two-topping pizza: the card's cheese from crate 2, its pepperoni from crate 3
    ...prepare('crate1', 'raw1'),
    ...(RECIPE_DEFS[recipe].fold ? [{ at: 'pot', take: 'fold', done: (_g: Game, _p: Player, s: Station) => !!s.folded } as Step] : []),
    { at: 'plates', take: 'a', done: (_g, p) => p.item === 'plate' },
    { at: 'pot', take: 'serve', done: (_g, p) => isDish(p.item) },
    ...(recipe === 'margfresca' ? [{ at: 'crate4', take: 'a', done: (_g: Game, p: Player) => p.item === 'dishQB' } as Step] : []), // the basil goes on the baked pizza, on its plate
    { at: 'window', take: 'a', done: (_g, p) => !p.item },
  ];
};
const STUCK_MS = 25_000;
const PRESS_EVERY = 12;

export function decideR(g: Game, p: Player, rank: number, m: RMem, tickNo: number): Controls {
  const idle: Controls = { x: 0, y: 0, a: 0, b: false };
  if (!m.recipe && !m.bin) {
    const q = g.teams[p.team]?.orders ?? [];
    m.recipe = m.force ?? q[rank % Math.max(1, q.length)]?.recipe ?? 'marinara';
  }
  const steps = stepsFor(m.recipe ?? 'marinara');
  const step = steps[m.step]!;
  const bins = g.stations.filter((x) => x.kind === 'trash' || x.kind === 'counter');
  const list = m.bin ? bins : stationsOf(g, step.at);
  const s: Station | undefined = list[rank % Math.max(1, list.length)];
  if (!s) return idle;
  if (m.bin ? !p.item : step.done(g, p, s)) {
    m.step = m.bin ? 0 : (m.step + 1) % steps.length;
    if (m.step === 0) m.recipe = null; // a new pizza: look at the queue again
    m.bin = false;
    m.since = g.time;
    return idle;
  }
  if (g.time - m.since > STUCK_MS) { m.since = g.time; if (p.item) m.bin = true; else { m.step = 0; m.recipe = null; } return idle; }
  const { arrived, next } = route(g, p, s);
  if (!arrived) {
    if (!next) return idle;
    const dx = next[0] + 0.5 - p.x, dy = next[1] + 0.5 - p.y, l = Math.hypot(dx, dy) || 1;
    return { x: dx / l, y: dy / l, a: 0, b: false };
  }
  const fx = s.tx + 0.5 - p.x, fy = s.ty + 0.5 - p.y, l = Math.hypot(fx, fy) || 1;
  const face = { x: fx / l, y: fy / l };
  const onIt = targetStation(g, p) === s;
  const take = m.bin ? 'a' : step.take;
  if (take === 'chop' || take === 'fold') return { ...face, a: 0, b: onIt };
  if (!onIt || tickNo - m.lastPress < PRESS_EVERY || (take === 'serve' && !s.done)) return { ...face, a: 0, b: false };
  m.lastPress = tickNo;
  return { ...face, a: 1, b: false };
}

export interface CookRun { g: Game; bus: RecBus; ticks: number }
/** One coop round with the recipes on: `n` scripted chefs on a map (default 9, which has crates 1 2 3 and ovens), `force` makes them all cook that recipe. `before(g, tick)` runs ahead of each tick. */
export function cookRound(o: { mapId?: string; difficulty?: Difficulty; n?: number; seed?: number; force?: Recipe; seconds?: number; recipes?: boolean; before?: (g: Game, t: number) => void }): CookRun {
  const map = fixedMap(o.mapId ?? '9')!;
  const bus = new RecBus();
  const n = o.n ?? 2;
  const g = createGame({ mapId: map.id, difficulty: o.difficulty ?? 'normal', n, rows: map.rows, spawns: map.spawns, seed: o.seed ?? 5, countdownMs: COUNTDOWN_MS, bus, recipes: o.recipes ?? true });
  if (o.seconds) g.params.roundMs = o.seconds * 1000;
  const ids = Array.from({ length: n }, (_v, i) => i + 1);
  ids.forEach((id, rank) => addPlayer(g, id, rank, rank));
  const mem = new Map(ids.map((id) => [id, newMem(o.force)]));
  let t = 0;
  const limit = Math.ceil((COUNTDOWN_MS + g.params.roundMs) / TICK_MS) + 60;
  while (!g.over && t < limit) {
    bus.tick = t;
    o.before?.(g, t);
    const controls = new Map<number, Controls>();
    ids.forEach((id, rank) => controls.set(id, decideR(g, g.players.get(id)!, rank, mem.get(id)!, t)));
    tick(g, controls);
    t++;
  }
  return { g, bus, ticks: t };
}

// --- Goldens with the cards switched on: fixtures of their own (shared/golden/recipes-*.json), re-recorded on purpose with tools/record-golden.ts. The original six never set `recipes`.
// Picked by scanning (map, difficulty, n, seed) for rounds where the scripted chefs deliver the new recipes: map 9 (Marinara, Pepperoni, Calzone) delivers one Marinara, two
// Pepperoni and two Calzone; map 12 (Marinara, Champiñón, Calzone) one of each; map 2 (Marinara, Calzone: no cheese crate) three Calzone; map 14 (Marinara, Pepperoni) three Pepperoni.
export interface RecipeScenario { name: string; mapId: string; difficulty: Difficulty; n: number; seed: number }
export const RECIPE_SCENARIOS: readonly RecipeScenario[] = [
  { name: 'recipes-n2-map9-normal', mapId: '9', difficulty: 'normal', n: 2, seed: 1 },
  { name: 'recipes-n3-map12-hard', mapId: '12', difficulty: 'hard', n: 3, seed: 5 },
  { name: 'recipes-n2-map2-normal', mapId: '2', difficulty: 'normal', n: 2, seed: 2 },
  { name: 'recipes-n4-map14-normal', mapId: '14', difficulty: 'normal', n: 4, seed: 5 },
];
export interface RecipeGolden {
  name: string;
  score: number; delivered: number; expired: number; rejected: number; tips: number; bestStreak: number; ticks: number;
  chefs: { id: number; x: number; y: number; item: string | null }[];
  events: string[];
}
export function runRecipeGolden(sc: RecipeScenario): RecipeGolden {
  const { g, bus, ticks } = cookRound(sc);
  const r6 = (v: number) => Math.round(v * 1e6) / 1e6;
  return {
    name: sc.name, score: g.score, delivered: g.delivered, expired: g.expired, rejected: g.rejected, tips: g.tips, bestStreak: g.bestStreak, ticks,
    chefs: [...g.players.values()].map((p) => ({ id: p.id, x: r6(p.x), y: r6(p.y), item: p.item })),
    events: bus.log,
  };
}
