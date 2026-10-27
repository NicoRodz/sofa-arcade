// The Carta del día (recipes/*): pure logic on the real maps. What each recipe is worth, the cards and their validator, the orders a round draws, the crate that gives the
// topping, the plate that serves each order, the calzone's fold at the oven, and the star table that follows. Chefs are put next to the stations by hand.
import { describe, expect, it } from 'vitest';
import type { Emitter, GameEvents } from '@pichi/core/events';
import { DIRS, FIXED_MAPS, fixedMap, isFloor, parseMap } from './maps';
import {
  TICK_MS,
  addPlayer,
  createGame,
  recipeBase,
  tick,
  tipMultiplier,
  type Controls,
  type Game,
  type Item,
  type Order,
  type Station,
} from './overcooked';
import { TUNING } from '@pichi/core/difficulty';
import { validateMap, validateVersus } from './validate';
import { VERSUS_BASE_MAPS, VERSUS_MAPS } from './versus/maps';
import { CARDS, CARD_MAX, CARD_MIN, cardFor, cardShapeProblems, toppingRecipe } from './recipes/cards';
import { cardProblems } from './recipes/card-check';
import {
  CALZONE_COOK_MULT,
  FOLD_MS,
  RECIPES,
  RECIPE_DEFS,
  RECIPE_PARTS,
  SLICE_MULT,
  cutOf,
  cutType,
  dishFor,
  dishRecipe,
  isDish,
  type Recipe,
} from './recipes/defs';
import { canFold, createRec, crateItem, pickOrder, pickRecipe } from './recipes/sim';
import { recipeStarFactor, starsTable } from './recipes/stars';
import { starThresholds } from './stars';
import { summarize } from './results';
import { mulberry32 } from '@pichi/core/rng';
import { chefHint } from './hints';
import { LABEL_MAX } from '@pichi/core/games';

const idle: Controls = { x: 0, y: 0, a: 0, b: false };
const mk = (map = '9', o: { recipes?: boolean; seed?: number; n?: number; bus?: Emitter<GameEvents> } = {}) => {
  const g = createGame({ rows: fixedMap(map)!.rows, mapId: map, n: 2, seed: o.seed ?? 5, recipes: o.recipes ?? true, bus: o.bus });
  for (let i = 1; i <= (o.n ?? 1); i++) addPlayer(g, i, i - 1, i - 1);
  return g;
};
const run = (g: Game, ms: number, c: Controls = idle) => {
  for (let t = 0; t < ms - 1e-6; t += TICK_MS) tick(g, new Map([...g.players.keys()].map((id): [number, Controls] => [id, c])));
};
const kind = (g: Game, k: Station['kind']) => g.stations.filter((s) => s.kind === k);
function face(g: Game, id: number, s: Station) {
  const p = g.players.get(id)!;
  const [dx, dy] = DIRS.find(([dx, dy]) => isFloor(g.grid, s.tx + dx, s.ty + dy))!;
  Object.assign(p, { x: s.tx + dx + 0.5, y: s.ty + dy + 0.5, fx: -dx, fy: -dy, vx: 0, vy: 0 });
  return p;
}
const order = (id: number, recipe: Recipe, o: Partial<Order> = {}): Order => ({ id, expiresAt: 1e9, warned: false, recipe, ...o });

describe('what each recipe is worth: 20 per ingredient, 10 per process', () => {
  const t = TUNING.normal;
  it('Marinara 70 and Margarita 100 exactly as before; Pepperoni and Champiñón 100 (a topping: one more ingredient, one more cut); Calzone 90 (two ingredients, fold and a double bake)', () => {
    expect(RECIPES.map((r) => [r, recipeBase(r, t)])).toEqual([
      ['marinara', 70],
      ['margarita', 100],
      ['pepperoni', 100],
      ['champinon', 100],
      ['calzone', 90],
      ['pepqueso', 140], // two toppings: four ingredients and six processes
    ]);
    expect(RECIPE_PARTS.marinara).toEqual({ components: 2, processes: 3 });
    expect(RECIPE_PARTS.margarita).toEqual({ components: 3, processes: 4 });
    for (const r of RECIPES)
      expect(recipeBase(r, t)).toBe(RECIPE_DEFS[r].components * t.baseComponent + RECIPE_DEFS[r].processes * t.baseProcess);
  });
  it('only the Calzone adds the verb "doblar"; only the topping recipes need the cheese crate (station 3)', () => {
    expect(RECIPES.filter((r) => RECIPE_DEFS[r].fold)).toEqual(['calzone']);
    expect(RECIPES.filter((r) => RECIPE_DEFS[r].needs.includes('3'))).toEqual(['margarita', 'pepperoni', 'champinon', 'pepqueso']);
  });
  it('items: raw<N> is cut into cut<N>; a plate says which recipe it holds', () => {
    expect(['raw0', 'raw1', 'raw2', 'raw3', 'raw4'].map((i) => cutOf(i as Item))).toEqual(['cut0', 'cut1', 'cut2', 'cut3', 'cut4']);
    expect(cutOf('plate')).toBeNull();
    expect(['cut0', 'cut3', 'cut4', 'dish', null].map((i) => cutType(i as Item | null))).toEqual([0, 3, 4, -1, -1]);
    expect((['dish', 'dishQ', 'dishP', 'dishM', 'dishC'] as Item[]).map(dishRecipe)).toEqual([
      'marinara',
      'margarita',
      'pepperoni',
      'champinon',
      'calzone',
    ]);
    expect(isDish('dishC') && isDish('dishP') && isDish('dishM') && isDish('dish') && isDish('dishQ')).toBe(true);
    expect(isDish('burnt') || isDish('plate') || isDish(null)).toBe(false);
    expect([
      dishFor([0, 1], false),
      dishFor([0, 1, 2], false),
      dishFor([0, 3, 1], false),
      dishFor([0, 1, 4], false),
      dishFor([0, 1], true),
    ]).toEqual(['dish', 'dishQ', 'dishP', 'dishM', 'dishC']);
  });
});

describe('the cards: 2 or 3 recipes per map, validated', () => {
  it('every one of the 15 coop maps and the 5 versus maps has a card (a derived versus map plays its coop map card)', () => {
    for (const m of FIXED_MAPS) expect(cardFor(m.id), `map ${m.id}`).toBeDefined();
    for (const m of VERSUS_BASE_MAPS) expect(cardFor(m.id), `map ${m.id}`).toBeDefined();
    expect(cardFor('11-vs')).toBe(cardFor('11'));
    expect(cardFor('whatever')).toBeUndefined();
    expect(cardFor(undefined)).toBeUndefined();
    expect(Object.keys(CARDS)).toHaveLength(21);
  });
  it('every card has the right shape, and a card with a topping recipe sits on a map with the cheese crate', () => {
    for (const [id, card] of Object.entries(CARDS)) {
      expect(cardShapeProblems(card), id).toEqual([]);
      expect(card.recipes.length).toBeGreaterThanOrEqual(CARD_MIN);
      expect(card.recipes.length).toBeLessThanOrEqual(CARD_MAX);
    }
    for (const m of FIXED_MAPS)
      if (toppingRecipe(cardFor(m.id)!))
        expect(
          m.rows.some((r) => r.includes('3')),
          `map ${m.id}`,
        ).toBe(true);
  });
  it('the validator proves every card on the 15 coop maps and, in each kitchen, on the 5 versus maps (plus the derived one)', () => {
    for (const m of FIXED_MAPS) {
      expect(cardProblems(cardFor(m.id)!, parseMap(m.rows)), `map ${m.id}`).toEqual([]);
      expect(
        validateMap(m).errors.filter((e) => /recipe|card/i.test(e)),
        `map ${m.id}`,
      ).toEqual([]);
    }
    for (const m of VERSUS_MAPS)
      expect(
        validateVersus(m, { requireMirror: false }).errors.filter((e) => /recipe|card/i.test(e)),
        `map ${m.id}`,
      ).toEqual([]);
  });
  it('a bad card on a versus map is reported once per kitchen, with the kitchen named', () => {
    const v4 = VERSUS_BASE_MAPS.find((m) => m.id === 'V4')!;
    const cards = CARDS as Record<string, { recipes: readonly Recipe[] }>;
    const good = cards.V4!;
    try {
      cards.V4 = { recipes: ['calzone', 'pepperoni'] };
      const errors = validateVersus(v4, { requireMirror: false }).errors.filter((e) => /card/i.test(e));
      expect(errors).toEqual(['kitchen A: the card has no Marinara', 'kitchen B: the card has no Marinara']);
    } finally {
      cards.V4 = good;
    }
    expect(validateVersus(v4, { requireMirror: false }).errors.filter((e) => /card/i.test(e))).toEqual([]);
  });
  it('the cards are varied: every recipe shows up, and a map without the cheese crate has Marinara + Calzone', () => {
    const all = new Set(Object.values(CARDS).flatMap((c) => c.recipes));
    expect([...all].sort()).toEqual([...RECIPES].sort());
    for (const id of ['1', '2', '3', '4', '5', '6', '7', '8']) expect(cardFor(id)!.recipes).toEqual(['marinara', 'calzone']);
    expect(new Set(Object.values(CARDS).map((c) => c.recipes.join())).size).toBeGreaterThanOrEqual(6);
  });
  it('the validator rejects a bad card: wrong size, a repeat, no Marinara, two toppings', () => {
    expect(cardShapeProblems({ recipes: ['marinara'] })).toHaveLength(1);
    expect(cardShapeProblems({ recipes: ['marinara', 'calzone', 'pepperoni', 'champinon'] }).length).toBeGreaterThan(0);
    expect(cardShapeProblems({ recipes: ['marinara', 'marinara'] })).toContain('a recipe is twice on the card');
    expect(cardShapeProblems({ recipes: ['calzone', 'pepperoni'] })).toContain('the card has no Marinara');
    expect(cardShapeProblems({ recipes: ['marinara', 'pepperoni', 'champinon'] }).join()).toMatch(/at most one recipe with a topping/);
  });
  it('and a card the map cannot serve: a Pepperoni where there is no cheese crate, and a cheese crate no chef can reach', () => {
    const g1 = parseMap(fixedMap('1')!.rows);
    expect(cardProblems({ recipes: ['marinara', 'pepperoni'] }, g1).join()).toMatch(
      /pepperoni \(Pepperoni\) needs station 3: it is not on the map/,
    );
    const walled = fixedMap('9')!.rows.map((r, y) => (y === 1 ? r.slice(0, 6) + '#' + r.slice(7) : r)); // the only tile in front of the '3' at (6, 0) becomes a wall
    expect(walled[0]![6]).toBe('3');
    expect(cardProblems({ recipes: ['marinara', 'pepperoni'] }, parseMap(walled)).join()).toMatch(/needs station 3: no chef can reach it/);
    expect(cardProblems(cardFor('9')!, parseMap(fixedMap('9')!.rows))).toEqual([]);
  });
});

describe('a round with the card: the orders, the crate, the plates', () => {
  it('without the flag nothing changes: no card, and the same recipe draws as always (Margarita only on a cheese map, a draw only when it has cheese)', () => {
    expect(createGame({ mapId: '9', rows: fixedMap('9')!.rows }).rec).toBeNull();
    expect(createGame({ recipes: true }).rec).toBeNull(); // a generated map has no card
    for (const map of ['2', '9'])
      for (const seed of [1, 2, 3]) {
        const g = mk(map, { recipes: false, seed });
        const a = mulberry32(seed),
          b = mulberry32(seed);
        for (let i = 0; i < 50; i++)
          expect(pickRecipe(g, a)).toBe(g.hasCheese && b() * 100 < g.params.cheesePct ? 'margarita' : 'marinara');
      }
  });
  it('the card of the map: Marinara 40%, the rest split equally; the crate gives the topping of the card', () => {
    const g = mk('9');
    expect(g.rec!.recipes).toEqual(['marinara', 'pepperoni', 'calzone']);
    expect(g.rec!.weights).toEqual([40, 30, 30]);
    expect(g.rec!.topping).toBe(3);
    expect(mk('10').rec!.weights).toEqual([40, 60]);
    expect(mk('10').rec!.topping).toBe(4);
    expect(mk('13').rec!.topping).toBe(2); // Margarita: the cheese itself
    expect(mk('2').rec!.recipes).toEqual(['marinara', 'calzone']);
    expect(['raw0', 'raw1', 'raw2'].map((_i, c) => crateItem(g, c))).toEqual(['raw0', 'raw1', 'raw3']);
    expect(crateItem(mk('9', { recipes: false }), 2)).toBe('raw2');
  });
  it('a recipe whose station the map lacks is dropped: the card of map 9 on a kitchen with no cheese crate is Marinara + Calzone', () => {
    const g = createGame({ rows: fixedMap('1')!.rows, mapId: '9', recipes: true });
    expect(g.rec!.recipes).toEqual(['marinara', 'calzone']);
    expect(createRec(g.stations, '9')!.weights).toEqual([40, 60]);
  });
  it('every order of the round comes from the card, in about the card proportions, and the same seed gives the same queue', () => {
    const g = mk('9');
    const rng = mulberry32(3);
    const drawn = Array.from({ length: 3000 }, () => pickRecipe(g, rng));
    const share = (r: Recipe) => drawn.filter((x) => x === r).length / drawn.length;
    expect(new Set(drawn)).toEqual(new Set(['marinara', 'pepperoni', 'calzone']));
    expect(share('marinara')).toBeGreaterThan(0.36);
    expect(share('marinara')).toBeLessThan(0.44);
    expect(share('pepperoni')).toBeGreaterThan(0.26);
    expect(share('calzone')).toBeGreaterThan(0.26);
    const q = (seed: number) => {
      const x = mk('9', { seed });
      run(x, 3000 + 60_000);
      return x.teams[0]!.orders.map((o) => o.recipe);
    };
    expect(q(7)).toEqual(q(7));
    for (const r of q(7)) expect(['marinara', 'pepperoni', 'calzone']).toContain(r);
  });
  it('the window serves a plate to its own recipe: a Calzone only to a Calzone, a topping plate also to a Marinara, never a Marinara to a Pepperoni', () => {
    const g = mk('9');
    const q = [order(1, 'pepperoni'), order(2, 'marinara'), order(3, 'calzone')];
    expect(pickOrder(g, q, 'dishC')).toBe(2);
    expect(pickOrder(g, q, 'dish')).toBe(1);
    expect(pickOrder(g, q, 'dishP')).toBe(0);
    expect(pickOrder(g, [order(1, 'calzone')], 'dishP')).toBe(-1); // a Pepperoni is not a Calzone
    expect(pickOrder(g, [order(1, 'calzone')], 'dish')).toBe(-1);
    expect(pickOrder(g, [order(1, 'pepperoni')], 'dishC')).toBe(-1);
    expect(pickOrder(g, [order(1, 'marinara')], 'dishC')).toBe(-1); // nor a Calzone a Marinara
    expect(pickOrder(g, [order(1, 'pepperoni')], 'dish')).toBe(-1);
    expect(pickOrder(g, [order(1, 'marinara'), order(2, 'pepperoni')], 'dishP')).toBe(1); // its own recipe before a Marinara
    expect(pickOrder(g, [order(1, 'marinara')], 'dishP')).toBe(0); // ... and a Marinara when that is all there is
    expect(pickOrder(g, [order(1, 'pepperoni'), order(2, 'calzone', { vip: true })], 'dishC')).toBe(1); // the golden order first
    expect(pickOrder(g, [order(1, 'calzone'), order(2, 'calzone', { birthday: true })], 'dishC')).toBe(1);
  });
  it('the old window rule is untouched without a card: a Margarita fits any order, a Marinara only a Marinara', () => {
    const g = mk('9', { recipes: false });
    expect(pickOrder(g, [order(1, 'marinara')], 'dishQ')).toBe(0);
    expect(pickOrder(g, [order(1, 'margarita'), order(2, 'marinara')], 'dish')).toBe(1);
    expect(pickOrder(g, [order(1, 'margarita')], 'dish')).toBe(-1);
    expect(pickOrder(g, [order(1, 'marinara'), order(2, 'marinara', { vip: true })], 'dishQ')).toBe(1);
  });
  it('delivering pays the base of the order: a Calzone 90, a Pepperoni 100, a Marinara 70 (tip and streak on top as always)', () => {
    const g = mk('9');
    const bus: GameEvents['delivered'][] = [];
    g.bus.on('delivered', (e) => bus.push(e));
    const win = kind(g, 'window')[0]!;
    g.teams[0]!.orders = [
      order(1, 'calzone', { expiresAt: g.time + g.params.orderTtlMs }),
      order(2, 'pepperoni', { expiresAt: g.time + g.params.orderTtlMs }),
      order(3, 'marinara', { expiresAt: g.time + g.params.orderTtlMs }),
    ];
    for (const dish of ['dishC', 'dishP', 'dish'] as const) {
      const p = face(g, 1, win);
      p.item = dish;
      tick(g, new Map([[1, { ...idle, a: 1 }]]));
    }
    expect(bus.map((e) => e.base)).toEqual([90, 100, 70]);
    expect(bus.map((e) => e.points)).toEqual(
      bus.map((e, i) => e.base + Math.round(e.base * TUNING.normal.tipPct * 1) * tipMultiplier(i, TUNING.normal)),
    );
    expect(g.delivered).toBe(3);
    expect(g.rejected).toBe(0);
  });
});

describe('the Pepperoni: the slices take longer on the board', () => {
  it('a raw pepperoni needs SLICE_MULT times the board time of a tomato, and ends as cut3', () => {
    const board = (item: Item) => {
      const g = mk('9');
      const b = kind(g, 'board')[0]!;
      b.item = item;
      face(g, 1, b);
      let t = 0;
      while (b.item === item && t < 30_000) {
        tick(g, new Map([[1, { ...idle, b: true }]]));
        t += TICK_MS;
      }
      return { t, item: b.item };
    };
    const tomato = board('raw1'),
      pepperoni = board('raw3');
    expect(tomato.item).toBe('cut1');
    expect(pepperoni.item).toBe('cut3');
    expect(pepperoni.t / tomato.t).toBeGreaterThan(SLICE_MULT - 0.05);
    expect(pepperoni.t / tomato.t).toBeLessThan(SLICE_MULT + 0.05);
  });
});

describe('the Calzone: hold Picar at the oven with dough and tomato, and it bakes longer', () => {
  const loaded = (map = '9') => {
    const g = mk(map);
    const o = kind(g, 'pot')[0]!;
    o.inputs = [0, 1];
    return { g, o };
  };
  it('foldable only with a card that has a calzone, dough and tomato (nothing else) loaded, cooking, not folded, not on fire', () => {
    const { g, o } = loaded();
    expect(canFold(g, o)).toBe(true);
    expect(canFold(mk('9', { recipes: false }), Object.assign(kind(mk('9', { recipes: false }), 'pot')[0]!, { inputs: [0, 1] }))).toBe(
      false,
    );
    expect(canFold(mk('14'), Object.assign(kind(mk('14'), 'pot')[0]!, { inputs: [0, 1] }))).toBe(false); // the card of map 14 has no calzone
    for (const bad of [
      { inputs: [0] },
      { inputs: [1] },
      { inputs: [0, 1, 3] },
      { inputs: [] },
      { done: true },
      { folded: true as const },
      { fire: 0 },
    ]) {
      const { g: g2, o: o2 } = loaded();
      Object.assign(o2, bad);
      expect(canFold(g2, o2), JSON.stringify(bad)).toBe(false);
    }
    expect(canFold(g, kind(g, 'board')[0]!)).toBe(false);
  });
  it('FOLD_MS of Picar folds it (foldStart, foldDone, foldStop), a shorter one only advances the fold', () => {
    const { g, o } = loaded();
    const seen: string[] = [];
    for (const k of ['foldStart', 'foldStop', 'foldDone', 'chopStart'] as const) g.bus.on(k, () => seen.push(k));
    face(g, 1, o);
    run(g, FOLD_MS * 0.5, { ...idle, b: true });
    expect(o.folded).toBeUndefined();
    expect(o.fold!).toBeGreaterThan(0.4);
    expect(o.fold!).toBeLessThan(0.6);
    run(g, FOLD_MS * 0.5 + 100, { ...idle, b: true });
    expect(o.folded).toBe(true);
    expect(o.fold).toBeUndefined();
    expect(seen).toEqual(['foldStart', 'foldDone', 'foldStop']); // never the chop sound; the fold ends the Picar by itself
    expect(g.players.get(1)!.cutting).toBe(false);
  });
  it('Picar at an oven that cannot be folded does nothing (no fold, no cutting state)', () => {
    const g = mk('9');
    const o = kind(g, 'pot')[0]!;
    o.inputs = [0];
    face(g, 1, o);
    run(g, 1000, { ...idle, b: true });
    expect(o.fold).toBeUndefined();
    expect(g.players.get(1)!.cutting).toBe(false);
  });
  it('a folded calzone bakes CALZONE_COOK_MULT times longer, comes out as a dishC, and nobody can add a topping to it', () => {
    const bake = (fold: boolean) => {
      const { g, o } = loaded();
      if (fold) o.folded = true;
      let t = 0;
      while (!o.done && t < 60_000) {
        run(g, TICK_MS);
        t += TICK_MS;
      }
      return { g, o, t };
    };
    const plain = bake(false),
      calzone = bake(true);
    expect(calzone.t / plain.t).toBeGreaterThan(CALZONE_COOK_MULT - 0.05);
    expect(calzone.t / plain.t).toBeLessThan(CALZONE_COOK_MULT + 0.05);
    const p = face(calzone.g, 1, calzone.o);
    p.item = 'plate';
    tick(calzone.g, new Map([[1, { ...idle, a: 1 }]]));
    expect(p.item).toBe('dishC');
    expect(calzone.o.folded).toBeUndefined(); // the oven is empty again
    expect(calzone.o.inputs).toEqual([]);
    const { g, o } = loaded();
    o.folded = true;
    const q = face(g, 1, o);
    q.item = 'cut3';
    tick(g, new Map([[1, { ...idle, a: 1 }]]));
    expect(o.inputs).toEqual([0, 1]);
    expect(q.item).toBe('cut3');
  });
  it('a pepperoni pizza comes out as a dishP and a champiñón one as a dishM; burnt is still burnt', () => {
    for (const [top, dish] of [
      [3, 'dishP'],
      [4, 'dishM'],
    ] as const) {
      const g = mk('9');
      const o = kind(g, 'pot')[0]!;
      Object.assign(o, { inputs: [0, top, 1], done: true, progress: 1 });
      const p = face(g, 1, o);
      p.item = 'plate';
      tick(g, new Map([[1, { ...idle, a: 1 }]]));
      expect(p.item).toBe(dish);
    }
    const g = createGame({ rows: fixedMap('9')!.rows, mapId: '9', recipes: true, burn: true });
    addPlayer(g, 1, 0, 0);
    const o = kind(g, 'pot')[0]!;
    Object.assign(o, { inputs: [0, 1], folded: true, done: true, progress: 1, burnt: true, readyAt: 0 });
    const p = face(g, 1, o);
    p.item = 'plate';
    tick(g, new Map([[1, { ...idle, a: 1 }]]));
    expect(p.item).toBe('burnt');
  });
});

describe('stars: version 1 stays, version 2 follows the card', () => {
  it('a round without a card reads the original table: factor 1, table 1, the same thresholds', () => {
    const g = mk('9', { recipes: false });
    expect(recipeStarFactor(g)).toBe(1);
    expect(starsTable(g)).toBe(1);
    expect(summarize(g).thresholds).toEqual(starThresholds('9', g.difficulty, g.n));
    expect(summarize(g).table).toBe(1);
  });
  it('a round with a card is table 2: the old thresholds times a factor near 1 (0.95 to 1.1 on every card of every map)', () => {
    for (const id of Object.keys(CARDS)) {
      const m = fixedMap(id) ?? VERSUS_BASE_MAPS.find((v) => v.id === id)!;
      const g = createGame({
        rows: m.rows.map((r) => r),
        mapId: id,
        recipes: true,
        teams: id.startsWith('V') ? [{ playerIds: [1] }, { playerIds: [2] }] : undefined,
      });
      const f = recipeStarFactor(g);
      expect(f, `card of ${id}`).toBeGreaterThan(0.95);
      expect(f, `card of ${id}`).toBeLessThan(1.1);
      expect(starsTable(g)).toBe(2);
    }
    const g = mk('9');
    const f = recipeStarFactor(g);
    expect(f).not.toBe(1);
    expect(summarize(g).thresholds).toEqual(starThresholds('9', g.difficulty, g.n, f));
    expect(summarize(g).table).toBe(2);
  });
  it('the factor is value per effort against the old mix: Marinara + Calzone is worth more per unit of work than Marinara alone (no cheese map), Pepperoni less than Margarita', () => {
    const f = (map: string) => recipeStarFactor(mk(map));
    expect(f('2')).toBeGreaterThan(1); // 40% Marinara, 60% Calzone
    expect(f('14')).toBeLessThan(f('13')); // Marinara + Pepperoni against Marinara + Margarita + Calzone
  });
});

describe('the phone: contextual buttons for the new recipes', () => {
  it('the cheese crate says what it gives (queso, Pepperoni, Champiñón); an oven that can be folded offers Doblar on B, and it greys out once folded', () => {
    const crate2 = (g: Game) => kind(g, 'crate').find((s) => s.crate === 2)!;
    const label = (g: Game, s: Station) => {
      face(g, 1, s);
      return chefHint(g, g.players.get(1)!);
    };
    expect(label(mk('13'), crate2(mk('13'))).a).toBe('Tomar queso');
    const g = mk('9');
    expect(label(g, crate2(g)).a).toBe('Pepperoni');
    expect(label(mk('12'), crate2(mk('12'))).a).toBe('Champiñón');
    expect(label(mk('9', { recipes: false }), crate2(mk('9', { recipes: false }))).a).toBe('Tomar queso');
    const o = kind(g, 'pot')[0]!;
    o.inputs = [0, 1];
    const h = label(g, o);
    expect(h.b).toBe('Doblar');
    expect(h.bOff).toBeUndefined();
    o.folded = true;
    expect(label(g, o).b).toBe('Picar');
    expect(label(g, o).bOff).toBe(true);
    const p = g.players.get(1)!;
    p.item = 'dishC';
    expect(label(g, kind(g, 'window')[0]!).a).toBe('Entregar'); // g has orders from the start
    for (const l of ['Tomar queso', 'Pepperoni', 'Champiñón', 'Doblar', 'Rebanar']) expect(l.length).toBeLessThanOrEqual(LABEL_MAX);
  });
});
