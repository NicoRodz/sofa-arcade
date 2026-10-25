// Scripted chefs cook every recipe of the Carta del día through the real engine (golden/recipe-bot.ts): crate, board, oven, fold, plate, window, and the points each pays.
// Then the goldens: four whole rounds with the cards on, pinned like the original six (re-record on purpose: `npx tsx tools/record-golden.ts`).
import { describe, expect, it } from 'vitest';
import { RECIPE_SCENARIOS, cookRound, runRecipeGolden, type RecipeGolden } from './golden/recipe-bot';
import { RECIPE_DEFS, recipeBase, type Recipe } from './recipes/defs';
import { TUNING } from './difficulty';
import type { Order } from './overcooked';
import a from './golden/recipes-n2-map9-normal.json';
import b from './golden/recipes-n3-map12-hard.json';
import c from './golden/recipes-n2-map2-normal.json';
import d from './golden/recipes-n4-map14-normal.json';

type Ev = { tick: number } & Record<string, unknown>;
const evs = (log: string[], type: string): Ev[] =>
  log
    .map((l) => l.split('|'))
    .filter(([, t]) => t === type)
    .map(([tk, , p]) => ({ tick: Number(tk), ...(JSON.parse(p!) as Record<string, unknown>) }));

/** One chef alone, every order on the strip is `recipe`: it must cook it from raw ingredients and serve it. */
function cookOne(recipe: Recipe, map: string, seconds = 70) {
  const held = new Set<string>(); // every item the chef carried at some tick
  const r = cookRound({
    mapId: map,
    n: 1,
    seed: 3,
    force: recipe,
    seconds,
    before: (g, t) => {
      if (t === 0) g.teams[0]!.orders = [0, 1, 2].map((id): Order => ({ id, expiresAt: 1e9, warned: false, recipe }));
      const item = g.players.get(1)!.item;
      if (item) held.add(item);
    },
  });
  return {
    ...r,
    held,
    delivered: evs(r.bus.log, 'delivered'),
    rejected: evs(r.bus.log, 'dishRejected'),
    folds: evs(r.bus.log, 'foldDone'),
  };
}

describe('a scripted chef cooks each recipe of the card from the raw ingredients', () => {
  const cases: [Recipe, string][] = [
    ['marinara', '9'],
    ['pepperoni', '9'],
    ['champinon', '12'],
    ['calzone', '9'],
    ['calzone', '2'],
    ['pepperoni', '14'],
    ['champinon', '10'],
  ];
  for (const [recipe, map] of cases) {
    it(`${recipe} on map ${map}: delivered, paid ${recipeBase(recipe, TUNING.normal)} base, nothing refused`, () => {
      const r = cookOne(recipe, map);
      expect(r.delivered.length, 'something was delivered').toBeGreaterThanOrEqual(1);
      expect(r.rejected).toHaveLength(0);
      for (const e of r.delivered) expect(e.base).toBe(recipeBase(recipe, TUNING.normal));
      const top = RECIPE_DEFS[recipe].topping;
      if (top !== null) expect(r.held.has(`raw${top}`), `the chef took raw${top} from the cheese crate`).toBe(true);
      expect(r.held.has('raw2') && top !== 2).toBe(false); // no cheese in a round whose topping is another one
      if (RECIPE_DEFS[recipe].fold) expect(r.folds.length, 'the oven was folded').toBeGreaterThanOrEqual(r.delivered.length);
      else expect(r.folds).toHaveLength(0);
      const dishes = ['dish', 'dishQ', 'dishP', 'dishM', 'dishC'].filter((i) => r.held.has(i));
      expect(dishes).toEqual([{ marinara: 'dish', margarita: 'dishQ', pepperoni: 'dishP', champinon: 'dishM', calzone: 'dishC' }[recipe]]); // the plate that came out of the oven
    });
  }
  it('the calzone takes longer than a marinara from the first ingredient in the oven to the plate out (the long oven)', () => {
    const t = (recipe: Recipe) => {
      const r = cookOne(recipe, '9');
      return { start: evs(r.bus.log, 'potStart')[0]!.tick, ready: evs(r.bus.log, 'potReady')[0]!.tick };
    };
    const m = t('marinara'),
      z = t('calzone');
    const bake = (x: { start: number; ready: number }) => (x.ready - x.start) * (1000 / 60);
    expect(bake(m)).toBeGreaterThan(7900); // Normal: cookMs 8000
    expect(bake(m)).toBeLessThan(8200);
    expect(bake(z)).toBeGreaterThan(8000 * 1.35); // the fold (2 s) happens while it already bakes: what is left of the bake runs 1.6 times slower
    expect(bake(z)).toBeLessThan(8000 * 1.65);
  });
  it('a card round with the whole queue drawn from the card: every ticket of the round is a recipe of the card', () => {
    const r = cookRound({ mapId: '12', n: 3, difficulty: 'hard', seed: 5 });
    const card = new Set(['marinara', 'champinon', 'calzone']);
    const recipes = evs(r.bus.log, 'orderNew').map((e) => e.recipe as string);
    expect(recipes.length).toBeGreaterThan(5);
    for (const x of recipes) expect(card.has(x)).toBe(true);
    expect(new Set(recipes).size).toBe(3);
  });
});

describe('golden rounds with the cards on', () => {
  const FIXTURES: Record<string, RecipeGolden> = { [a.name]: a, [b.name]: b, [c.name]: c, [d.name]: d };
  const count = (r: RecipeGolden, type: string) => r.events.filter((e) => e.split('|')[1] === type).length;
  const bases = (r: RecipeGolden) => evs(r.events, 'delivered').map((e) => e.base as number);
  it('every scenario has its fixture, and each fixture delivers what its card brings', () => {
    expect(Object.keys(FIXTURES).sort()).toEqual(RECIPE_SCENARIOS.map((s) => s.name).sort());
    expect(bases(a)).toEqual(expect.arrayContaining([70, 100, 90])); // map 9: Marinara, Pepperoni, Calzone
    expect(bases(b)).toEqual(expect.arrayContaining([70, 100, 90])); // map 12: Marinara, Champiñón, Calzone
    expect(bases(c).filter((x) => x === 90).length).toBeGreaterThanOrEqual(2); // map 2 has no cheese crate: Marinara + Calzone
    expect(bases(c).every((x) => x === 70 || x === 90)).toBe(true);
    expect(bases(d).filter((x) => x === 100).length).toBeGreaterThanOrEqual(2); // map 14: Marinara + Pepperoni
    for (const r of [a, b, c]) expect(count(r, 'foldDone')).toBeGreaterThanOrEqual(1);
    expect(count(d, 'foldDone')).toBe(0);
    for (const r of [a, b, c, d]) expect(r.delivered).toBeGreaterThanOrEqual(3);
  });
  for (const sc of RECIPE_SCENARIOS) {
    it(`${sc.name}: score, counters, final chefs and every event match the fixture`, () => {
      const want = FIXTURES[sc.name]!;
      const { events: ge, ...gr } = runRecipeGolden(sc);
      const { events: we, ...wr } = want;
      expect(gr).toEqual(wr);
      expect(ge).toEqual(we);
    });
  }
});
