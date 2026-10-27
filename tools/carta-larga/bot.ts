// The scripted recipe chefs of games/pizzas/test/golden/recipe-bot.ts, with one fix the Carta larga needs: on a card with two topping crates (`bind`) a one-topping recipe
// (Champiñón, Pepperoni...) is taken from the crate the bind says, not always from crate 2. Same steps, same controls; only the crate of that topping changes.
// Measurement tool: nothing in the game imports it. The golden bot stays untouched.
import {
  COUNTDOWN_MS,
  TICK_MS,
  addPlayer,
  createGame,
  targetStation,
  tick,
  type Controls,
  type Game,
  type Player,
  type Station,
} from '@pichi/game-pizzas/sim/overcooked';
import { fixedMap } from '@pichi/game-pizzas/sim/maps';
import { cardFor } from '@pichi/game-pizzas/sim/recipes/cards';
import { RECIPE_DEFS, type Recipe } from '@pichi/game-pizzas/sim/recipes/defs';
import type { Difficulty } from '@pichi/core/difficulty';
import { stepsFor, newMem, type RMem } from '@pichi/game-pizzas/test/golden/recipe-bot';
import { RecBus, route, stationsOf } from '@pichi/game-pizzas/test/golden/bot';

type Step = ReturnType<typeof stepsFor>[number];
const stepsB = (recipe: Recipe, bind: readonly number[] | undefined): Step[] => {
  const top = RECIPE_DEFS[recipe].topping;
  const steps = stepsFor(recipe);
  if (top === null || !bind || bind.indexOf(top) !== 1) return steps;
  return steps.map((s) => (s.at === 'crate2' ? { ...s, at: 'crate3' as const } : s)); // the topping sits on the second crate of the bind
};
const stationsAt = (g: Game, at: string) =>
  at === 'saucepot' ? g.stations.filter((s) => s.kind === 'saucepot') : stationsOf(g, at as never);
const STUCK_MS = 25_000;
const PRESS_EVERY = 12;

function decide(g: Game, p: Player, rank: number, m: RMem, tickNo: number, bind: readonly number[] | undefined): Controls {
  const idle: Controls = { x: 0, y: 0, a: 0, b: false };
  if (!m.recipe && !m.bin) {
    const q = g.teams[p.team]?.orders ?? [];
    const ord = q[rank % Math.max(1, q.length)];
    m.recipe =
      m.force ?? (ord?.recipe === 'bandeja' ? (ord.parts?.find((_r, i) => !ord.served?.[i]) ?? 'marinara') : ord?.recipe) ?? 'marinara';
  }
  const steps = stepsB(m.recipe ?? 'marinara', bind);
  const step = steps[m.step]!;
  const bins = g.stations.filter((x) => x.kind === 'trash' || x.kind === 'counter');
  const list = m.bin ? bins : stationsAt(g, step.at);
  const s: Station | undefined = list[rank % Math.max(1, list.length)];
  if (!s) return idle;
  if (m.bin ? !p.item : step.done(g, p, s)) {
    m.step = m.bin ? 0 : (m.step + 1) % steps.length;
    if (m.step === 0) m.recipe = null;
    m.bin = false;
    m.since = g.time;
    return idle;
  }
  if (g.time - m.since > STUCK_MS) {
    m.since = g.time;
    if (p.item) m.bin = true;
    else {
      m.step = 0;
      m.recipe = null;
    }
    return idle;
  }
  const { arrived, next } = route(g, p, s);
  if (!arrived) {
    if (!next) return idle;
    const dx = next[0] + 0.5 - p.x,
      dy = next[1] + 0.5 - p.y,
      l = Math.hypot(dx, dy) || 1;
    return { x: dx / l, y: dy / l, a: 0, b: false };
  }
  const fx = s.tx + 0.5 - p.x,
    fy = s.ty + 0.5 - p.y,
    l = Math.hypot(fx, fy) || 1;
  const face = { x: fx / l, y: fy / l };
  const onIt = targetStation(g, p) === s;
  const take = m.bin ? 'a' : step.take;
  if (take === 'chop' || take === 'fold') return { ...face, a: 0, b: onIt };
  if (!onIt || tickNo - m.lastPress < PRESS_EVERY || (take === 'serve' && !s.done)) return { ...face, a: 0, b: false };
  m.lastPress = tickNo;
  return { ...face, a: 1, b: false };
}

/** One coop round of the series (its flags on): `n` scripted chefs; `force` makes them all cook that recipe; `before(g)` runs ahead of each tick. */
export function seriesRound(o: {
  mapId: string;
  difficulty: Difficulty;
  n: number;
  seed: number;
  force?: Recipe;
  before?: (g: Game) => void;
}): Game {
  const map = fixedMap(o.mapId)!;
  const bind = cardFor(o.mapId)?.bind;
  const bus = new RecBus();
  const g = createGame({
    mapId: map.id,
    difficulty: o.difficulty,
    n: o.n,
    rows: map.rows,
    spawns: map.spawns,
    seed: o.seed,
    countdownMs: COUNTDOWN_MS,
    bus,
    recipes: true,
    adaptive: true,
    upgradeOrders: true,
    sliceAfterBake: true,
    compoundOrders: true,
  });
  const ids = Array.from({ length: o.n }, (_v, i) => i + 1);
  ids.forEach((id, rank) => addPlayer(g, id, rank, rank));
  const mem = new Map(ids.map((id) => [id, newMem(o.force)]));
  const limit = Math.ceil((COUNTDOWN_MS + g.params.roundMs) / TICK_MS) + 60;
  for (let t = 0; !g.over && t < limit; t++) {
    bus.tick = t;
    o.before?.(g);
    const controls = new Map<number, Controls>();
    ids.forEach((id, rank) => controls.set(id, decide(g, g.players.get(id)!, rank, mem.get(id)!, t, bind)));
    tick(g, controls);
  }
  return g;
}
