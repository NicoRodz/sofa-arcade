// Every fixed map is played once through the real engine by a player that teleports next to each station (the validator
// proves the route exists; this proves the engine accepts the recipe on that map's stations).
import { describe, expect, it } from 'vitest';
import { FIXED_MAPS, DIRS, isFloor } from './maps';
import { TICK_MS, addPlayer, createGame, recipeBase, tick, type Controls, type Game, type Station } from './overcooked';

const idle: Controls = { x: 0, y: 0, a: 0, b: false };
const press = (g: Game) => tick(g, new Map([[1, { ...idle, a: 1 }]]));
const run = (g: Game, ms: number, c: Map<number, Controls> = new Map()) => { for (let t = 0; t < ms; t += TICK_MS) tick(g, c); };
const hold = new Map([[1, { ...idle, b: true }]]);
function face(g: Game, s: Station) {
  const p = g.players.get(1)!;
  const [dx, dy] = DIRS.find(([dx, dy]) => isFloor(g.grid, s.tx + dx, s.ty + dy))!;
  p.x = s.tx + dx + 0.5; p.y = s.ty + dy + 0.5; p.fx = -dx; p.fy = -dy;
}
const use = (g: Game, s: Station) => { face(g, s); press(g); };
export const first = (g: Game, kind: string, crate?: number) => g.stations.find((s) => s.kind === kind && (crate === undefined || s.crate === crate))!;

/** Marinara by hand: both crates -> board (hold B) -> oven, then plate -> oven -> window. Returns the score gained. */
export function playMarinara(g: Game): number {
  const board = first(g, 'board'), pot = first(g, 'pot');
  for (const type of [0, 1]) {
    use(g, first(g, 'crate', type));
    use(g, board);
    run(g, g.params.cutMs + 100, hold);
    use(g, board);
    use(g, pot);
  }
  run(g, g.params.cookMs + 100);
  use(g, first(g, 'plates'));
  use(g, pot);
  const before = g.score;
  use(g, first(g, 'window'));
  return g.score - before;
}

/** Margarita: cheese goes through a board too and joins dough and tomato in the oven. Needs a Margarita order in the queue. */
export function playMargarita(g: Game): number {
  const board = first(g, 'board'), pot = first(g, 'pot');
  g.orders = [{ id: 900, expiresAt: g.time + 60_000, warned: false, recipe: 'margarita' }];
  for (const type of [0, 1, 2]) {
    use(g, first(g, 'crate', type));
    use(g, board);
    run(g, g.params.cutMs + 100, hold);
    use(g, board);
    use(g, pot);
  }
  run(g, g.params.cookMs + 100);
  use(g, first(g, 'plates'));
  use(g, pot);
  expect(g.players.get(1)!.item).toBe('dishQ');
  const before = g.score;
  use(g, first(g, 'window'));
  return g.score - before;
}

describe('playthrough: one marinara delivered on every fixed map', () => {
  for (const m of FIXED_MAPS) {
    it(`map ${m.id} ${m.name}`, () => {
      const g = createGame({ rows: m.rows, spawns: m.spawns, n: m.nMin });
      addPlayer(g, 1, 0);
      expect(playMarinara(g)).toBeGreaterThanOrEqual(recipeBase('marinara', g.params.tune));
      expect(g.delivered).toBe(1);
    });
  }
});

describe('playthrough: one Margarita on every map with a cheese crate', () => {
  for (const m of FIXED_MAPS.filter((x) => x.rows.some((r) => r.includes('3')))) {
    it(`map ${m.id} ${m.name}`, () => {
      const g = createGame({ rows: m.rows, spawns: m.spawns, n: m.nMin });
      addPlayer(g, 1, 0);
      expect(playMargarita(g)).toBeGreaterThanOrEqual(recipeBase('margarita', g.params.tune));
    });
  }
});

/** The washing loop: a delivered plate comes back dirty, goes through the sink and can be used again. */
export function washCycle(g: Game) {
  const ret = first(g, 'dirty'), sink = first(g, 'sink');
  run(g, 6100); // DIRTY_MS after the delivery
  expect(ret.count).toBe(1);
  use(g, ret);
  expect(g.players.get(1)!.item).toBe('dirty');
  use(g, sink);
  face(g, sink);
  run(g, 1600, hold);
  expect(sink.clean).toBe(1);
  use(g, sink);
  expect(g.players.get(1)!.item).toBe('plate');
}

describe('playthrough: dish washing on every map with a sink', () => {
  for (const m of FIXED_MAPS.filter((x) => x.rows.some((r) => r.includes('L')))) {
    it(`map ${m.id} ${m.name}: deliver, wash the plate, serve a second pizza with it`, () => {
      const g = createGame({ rows: m.rows, spawns: m.spawns, n: m.nMin });
      addPlayer(g, 1, 0);
      expect(g.finitePlates).toBe(true);
      expect(playMarinara(g)).toBeGreaterThanOrEqual(recipeBase('marinara', g.params.tune));
      washCycle(g);
    });
  }
});
