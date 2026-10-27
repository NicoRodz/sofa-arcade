// The Bandeja familiar (Carta larga, map 28 Cocina espejo): one ticket of three plates. Behind `compoundOrders`; coop, 4+ chefs, one open at most; the third plate pays the tray.
import { describe, expect, it } from 'vitest';
import { addPlayer, createGame, tick, type Game, type Order } from './overcooked';
import { deliver, spawnOrder } from './round/orders';
import { fixedMap } from './maps';
import { MARGIN_MS, bandejaBase, pickParts } from './recipes/bandeja';
import { loadOf, patienceMs } from './recipes/pacing';
import { pickOrder, pickRecipe } from './recipes/sim';
import { RECIPE_DEFS, recipeBase } from './recipes/defs';
import { TUNING, type Difficulty } from '@pichi/core/difficulty';

const make = (o: { n?: number; difficulty?: Difficulty; compound?: boolean; adaptive?: boolean } = {}): Game => {
  const m = fixedMap('28')!;
  const g = createGame({
    rows: m.rows,
    mapId: '28',
    recipes: true,
    spawns: m.spawns,
    difficulty: o.difficulty ?? 'normal',
    upgradeOrders: true,
    compoundOrders: o.compound ?? true,
    adaptive: o.adaptive ?? false,
    n: o.n ?? 4,
    seed: 3,
  });
  for (let i = 1; i <= (o.n ?? 4); i++) addPlayer(g, i, i - 1, i - 1);
  return g;
};
/** Make every draw a Bandeja: the card of map 28 is Marinara, casa, Bandeja, calzone relleno. */
const onlyBandeja = (g: Game) => {
  g.rec!.weights = g.rec!.recipes.map((r) => (r === 'bandeja' ? 100 : 0));
};
const tray = (parts: Order['parts'] = ['marinara', 'margarita', 'calzone']): Order => ({
  id: 9,
  expiresAt: 1e9,
  warned: false,
  recipe: 'bandeja',
  parts,
});
const give = (g: Game, item: Parameters<typeof pickOrder>[2], id = 1) => {
  const p = g.players.get(id)!;
  p.item = item;
  deliver(g, p);
  return p;
};

describe('when a Bandeja comes up', () => {
  it('only with 4 or more chefs and never two open: the other draws come out as a Marinara', () => {
    const g = make();
    onlyBandeja(g);
    g.teams[0]!.orders = [];
    for (let i = 0; i < 5; i++) spawnOrder(g, g.teams[0]!, true);
    const kinds = g.teams[0]!.orders.map((o) => o.recipe);
    expect(kinds.filter((r) => r === 'bandeja')).toHaveLength(1);
    expect(kinds[0]).toBe('bandeja');
    expect(kinds.slice(1).every((r) => r === 'marinara')).toBe(true);
    const small = make({ n: 3 });
    onlyBandeja(small);
    small.teams[0]!.orders = [];
    for (let i = 0; i < 4; i++) spawnOrder(small, small.teams[0]!, true);
    expect(
      small.teams[0]!.orders.some((o) => o.recipe === 'bandeja'),
      'N=3',
    ).toBe(false);
  });
  it('it carries three plates of the card (different ones: the card has three to choose from), and twice the patience of a plate', () => {
    const g = make();
    onlyBandeja(g);
    g.teams[0]!.orders = [];
    spawnOrder(g, g.teams[0]!, true);
    const o = g.teams[0]!.orders[0]!;
    expect(o.parts).toHaveLength(3);
    expect(new Set(o.parts).size).toBe(3);
    for (const r of o.parts!) expect(g.rec!.recipes).toContain(r);
    expect(o.parts).not.toContain('bandeja');
    expect(o.expiresAt - g.time).toBe(g.params.orderTtlMs * 2);
    expect(pickParts(g, () => 0)).toHaveLength(3);
  });
  it('flag off: the card has no Bandeja and a round draws exactly once per order, as before', () => {
    const g = make({ compound: false, adaptive: true });
    expect(g.rec!.recipes).not.toContain('bandeja');
    let draws = 0;
    const seq0 = g.teams[0]!.orderSeq;
    const rng = g.teams[0]!.rng;
    g.teams[0]!.rng = () => (draws++, rng());
    for (let t = 0; t < 60 * 120; t++) {
      if (t % 300 === 0) g.teams[0]!.orders = []; // an empty queue asks for more
      tick(g, new Map());
    }
    expect(g.teams[0]!.orderSeq).toBeGreaterThan(seq0 + 3);
    expect(draws).toBe(g.teams[0]!.orderSeq - seq0);
    expect(g.teams[0]!.orders.some((o) => o.parts)).toBe(false);
  });
  it('in the adaptive load it counts as 3 whatever its plates', () => {
    const g = make();
    expect(RECIPE_DEFS.bandeja.effort).toBe(3);
    expect(loadOf({ orders: [tray()] })).toBe(3);
    expect(patienceMs(make({ adaptive: true }), 'marinara')).toBe(g.params.orderTtlMs);
  });
});

describe('serving a Bandeja', () => {
  it('each plate fills its slot and pays nothing; the third pays the sum of the three times 1.3 plus the tip', () => {
    const g = make();
    const team = g.teams[0]!;
    team.orders = [tray(['marinara', 'margarita', 'calzone'])];
    team.orders[0]!.expiresAt = g.time + g.params.orderTtlMs * 2;
    const p = give(g, 'dishQ');
    expect(p.item).toBeNull();
    expect(team.orders[0]!.served).toEqual([false, true, false]);
    expect(team.score).toBe(0);
    expect(team.delivered).toBe(0);
    give(g, 'dishC');
    expect(team.score).toBe(0);
    const sum = recipeBase('marinara', TUNING.normal) + recipeBase('margarita', TUNING.normal) + recipeBase('calzone', TUNING.normal);
    give(g, 'dish');
    expect(team.orders).toHaveLength(0);
    expect(team.delivered).toBe(1);
    expect(team.score - team.tips).toBe(Math.round(sum * 1.3));
    expect(team.tips).toBeGreaterThan(0);
  });
  it('the margin is 35 s on Easy, 25 s on Normal, 18 s on Difficult: later than that it pays the plain sum', () => {
    expect(MARGIN_MS).toEqual({ easy: 35_000, normal: 25_000, hard: 18_000 });
    for (const d of ['easy', 'normal', 'hard'] as const) {
      const sum = ['marinara', 'margarita', 'calzone'].reduce((n, r) => n + recipeBase(r as 'marinara', TUNING[d]), 0);
      for (const [gap, bonus] of [
        [MARGIN_MS[d] - 1000, true],
        [MARGIN_MS[d] + 1000, false],
      ] as const) {
        const g = make({ difficulty: d });
        const o = tray();
        o.firstAt = g.time;
        g.time += gap;
        expect(bandejaBase(g, o, TUNING[d]), `${d} ${gap}`).toBe(bonus ? Math.round(sum * 1.3) : sum);
      }
    }
  });
  it('a plate goes to the Bandeja before a loose order of the same recipe; a plate the tray does not need goes to the loose order; a plate nobody wants is refused', () => {
    const g = make();
    const loose: Order = { id: 1, expiresAt: 1e9, warned: false, recipe: 'marinara' };
    expect(pickOrder(g, [loose, tray()], 'dish')).toBe(1);
    expect(pickOrder(g, [loose, tray(['margarita', 'margarita', 'calzone'])], 'dish')).toBe(0);
    expect(pickOrder(g, [tray()], 'dishP')).toBe(0); // a topped plate also fills the Marinara slot
    expect(pickOrder(g, [tray(['margarita', 'margarita', 'calzone'])], 'dishP')).toBe(-1);
    const t = tray();
    t.served = [true, false, false];
    expect(pickOrder(g, [t], 'dish'), 'a slot filled is not filled twice').toBe(-1);
  });
  it('a plate of the tray that is not the right one is refused like any wrong plate: the streak resets', () => {
    const g = make();
    g.teams[0]!.orders = [tray(['marinara', 'margarita', 'calzone'])];
    g.teams[0]!.streak = 2;
    give(g, 'dishC');
    give(g, 'dishCR');
    expect(g.teams[0]!.rejected).toBe(1);
    expect(g.teams[0]!.streak).toBe(0);
  });
  it('pickRecipe never returns a Bandeja when none may open (no team given: the golden VIP)', () => {
    const g = make();
    onlyBandeja(g);
    expect(pickRecipe(g, () => 0.5)).toBe('marinara');
  });
});
