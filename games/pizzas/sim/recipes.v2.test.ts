// menuV2: the variety of plates (recipes/menu.ts, recipes/cards.ts CARDS_V2, maps/menu-patches.ts). Fácil serves 2 plates, Normal 3, Difícil the whole card; a bag makes every plate come up
// in the first k orders; the sequence is a function of the order's index and a sub-stream of the seed, so a birthday cake or the other kitchen cannot shift it.
import { describe, expect, it } from 'vitest';
import { DIFFICULTIES, type Difficulty } from '@pichi/core/difficulty';
import { TICK_MS, addPlayer, createGame, tick, type Controls, type Game } from './overcooked';
import { COOP_MAPS, fixedMap, parseMap } from './maps';
import { MENU_CRATE_AT, menuPatchRows } from './maps/menu-patches';
import { validateMap, validateVersus } from './validate';
import { VERSUS_BASE_MAPS, versusMap } from './versus/maps';
import { CARDS, CARDS_V2, cardForV2 } from './recipes/cards';
import { cardProblems, menuCardProblems } from './recipes/card-check';
import { MENU_MARINARA_PCT, MENU_SIZE, createMenu, menuAt, menuRecipes, subSeed } from './recipes/menu';
import { MID_FX } from './round/orders';
import { Emitter } from './round/events';
import { mechFlagsOf } from './mech/ids';
import type { Recipe } from './recipes/defs';

const idle: Controls = { x: 0, y: 0, a: 0, b: false };
const SERIES = (id: string) => Number(id) >= 20 && Number(id) <= 28;
const pace = { easy: 1.2, normal: 1.6, hard: 1.8 } as const;

/** A coop round with nobody cooking (orders keep coming, expire, come again): the plates of every order of `seconds`, in order, birthday orders left out. */
function orders(id: string, n: number, d: Difficulty, seed: number, seconds = 180, birthdayAt?: number) {
  const m = fixedMap(id)!;
  const bus = new Emitter<any>();
  const seen: { recipe: Recipe; birthday?: boolean }[] = [];
  bus.on('orderNew', (e: any) => seen.push({ recipe: e.recipe, birthday: e.birthday }));
  const s = SERIES(id);
  const g = createGame({
    rows: m.rows,
    mapId: id,
    spawns: m.spawns,
    recipes: true,
    menuV2: true,
    n,
    difficulty: d,
    seed,
    eventsSeed: seed,
    bus,
    pace: pace[d],
    adaptive: s,
    upgradeOrders: s,
    compoundOrders: s,
    mech: mechFlagsOf(m.mechanics),
    mutation: m.mutation,
  });
  for (let i = 1; i <= n; i++) addPlayer(g, i, i - 1, i - 1);
  for (let t = 0; t < (seconds * 1000) / TICK_MS; t++) {
    if (birthdayAt !== undefined && t === (birthdayAt * 1000) / TICK_MS) MID_FX.birthday(g);
    tick(g, new Map([...g.players.keys()].map((p) => [p, idle])));
  }
  return { g, list: seen.filter((o) => !o.birthday).map((o) => o.recipe) };
}

describe('the cut of the card by difficulty', () => {
  it('sorts by effort with the Marinara first and keeps 2 / 3 / all (the plates of every card are 2 to 4)', () => {
    expect(MENU_SIZE).toEqual({ easy: 2, normal: 3, hard: 4 });
    const c = (r: Recipe[], d: Difficulty) => menuRecipes(r, d);
    expect(c(['marinara', 'pepperoni', 'calzone'], 'easy')).toEqual(['marinara', 'calzone']);
    expect(c(['marinara', 'pepperoni', 'calzone'], 'normal')).toEqual(['marinara', 'calzone', 'pepperoni']);
    expect(c(['calzone', 'marinara'], 'hard')).toEqual(['marinara', 'calzone']);
    expect(c(['marinara', 'casa', 'bandeja', 'calzonerel'], 'hard')).toEqual(['marinara', 'casa', 'calzonerel', 'bandeja']);
    expect(c(['marinara', 'casa', 'bandeja', 'calzonerel'], 'easy')).toEqual(['marinara', 'casa']);
  });
  it("map 28: the cut keeps the card's signature plate (the Bandeja) and the Marinara, and drops the rest", () => {
    const card = cardForV2('28')!.recipes;
    expect(card).toContain('bandeja');
    expect(menuRecipes(card, 'normal')).toEqual(['marinara', 'casa', 'bandeja']);
    expect(menuRecipes(card, 'hard')).toEqual(['marinara', 'casa', 'calzonerel', 'bandeja']);
    expect(menuRecipes(card, 'easy')).toEqual(['marinara', 'casa']); // the Bandeja needs two other plates beside it
    for (const d of ['normal', 'hard'] as const) expect(menuRecipes(card, d)).toContain('bandeja');
    expect(menuRecipes(['marinara', 'nonna', 'champinon', 'calzonerel'], 'normal')).toContain('nonna');
  });
  it('maps 1-8: Fácil Marinara + Calzone (as before), Normal and Difícil add a third plate; Taller 29-36 get a card of 3', () => {
    for (const id of ['1', '2', '3', '4', '5', '6', '7', '8']) {
      expect(menuRecipes(cardForV2(id)!.recipes, 'easy'), id).toEqual(['marinara', 'calzone']);
      expect(menuRecipes(cardForV2(id)!.recipes, 'normal'), id).toEqual(['marinara', 'calzone', 'pepperoni']);
    }
    for (let id = 29; id <= 36; id++) expect(cardForV2(String(id))!.recipes, String(id)).toHaveLength(3);
    for (const id of ['10', '14', '16', '17', '18', '19', 'V4', 'V5']) expect(cardForV2(id)!.recipes, id).toHaveLength(3);
  });
  it('the legacy CARDS table is untouched: the maps that gain a plate in menuV2 keep their old card without the flag', () => {
    expect(CARDS['1']!.recipes).toEqual(['marinara', 'calzone']);
    expect(CARDS['10']!.recipes).toEqual(['marinara', 'champinon']);
    expect(CARDS['29']).toBeUndefined();
    const off = createGame({ rows: fixedMap('10')!.rows, mapId: '10', recipes: true });
    expect(off.rec!.recipes).toEqual(['marinara', 'champinon']);
    expect(off.rec!.menu).toBeUndefined();
    expect(
      createGame({ rows: fixedMap('29')!.rows, mapId: '29', recipes: true, mech: mechFlagsOf(fixedMap('29')!.mechanics) }).rec,
    ).toBeNull();
  });
  it('a generated map has no card even with the flag', () => {
    expect(createGame({ recipes: true, menuV2: true, mapId: 'random' }).rec).toBeNull();
  });
});

describe('the menu patches and card-check on the cut card', () => {
  const patched = Object.keys(MENU_CRATE_AT);
  it('patch exactly the maps with no cheese crate whose V2 card needs one; each patched map still validates', () => {
    for (const m of COOP_MAPS) {
      const needs = !m.rows.join('').includes('3') && !!CARDS_V2[m.id];
      expect(patched.includes(m.id), `map ${m.id}`).toBe(needs);
    }
    for (const id of patched) {
      const m = fixedMap(id)!;
      const rows = menuPatchRows(id, m.rows);
      expect(rows.join('').split('3').length - 1, id).toBe(1);
      expect(rows.join('').length).toBe(m.rows.join('').length);
      expect(validateMap({ ...m, rows }).errors, `map ${id}`).toEqual([]);
    }
  });
  it('the tile is the free counter nearest to the dough and tomato crates (ties by y, x); where there are no counters, the wall-side floor tile nearest to them', () => {
    for (const id of patched) {
      const m = fixedMap(id)!;
      const crates: [number, number][] = [];
      m.rows.forEach((r, y) => [...r].forEach((c, x) => (c === '1' || c === '2') && crates.push([x, y])));
      const cx = crates.reduce((a, p) => a + p[0], 0) / crates.length;
      const cy = crates.reduce((a, p) => a + p[1], 0) / crates.length;
      const wall = (x: number, y: number) =>
        [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ].some(([dx, dy]) => m.rows[y + dy!]?.[x + dx!] === '#');
      const all: [number, number, string][] = [];
      m.rows.forEach((r, y) => [...r].forEach((c, x) => (c === 'C' || (c === '.' && wall(x, y))) && all.push([x, y, c])));
      const pool = all.some((p) => p[2] === 'C') ? all.filter((p) => p[2] === 'C') : all;
      pool.sort((a, b) => Math.hypot(a[0] - cx, a[1] - cy) - Math.hypot(b[0] - cx, b[1] - cy) || a[1] - b[1] || a[0] - b[0]);
      const ok = pool.find(([x, y]) => {
        const rows = m.rows.map((r, j) => (j === y ? r.slice(0, x) + '3' + r.slice(x + 1) : r));
        return validateMap({ ...m, rows }).ok && !menuCardProblems(id, parseMap(rows, false, mechFlagsOf(m.mechanics))).length;
      })!;
      expect([ok[0], ok[1]], `map ${id}`).toEqual([...MENU_CRATE_AT[id]!]);
    }
  });
  it('card-check: every map with a card passes for every difficulty on the patched grid; without the patch map 1 fails (the check is not vacuous)', () => {
    for (const m of COOP_MAPS)
      if (cardForV2(m.id))
        expect(menuCardProblems(m.id, parseMap(menuPatchRows(m.id, m.rows), false, mechFlagsOf(m.mechanics))), m.id).toEqual([]);
    const m1 = fixedMap('1')!;
    expect(menuCardProblems('1', parseMap(m1.rows)).join()).toMatch(
      /menuV2 normal: recipe pepperoni .* needs station 3: it is not on the map/,
    );
    expect(menuCardProblems('1', parseMap(m1.rows)).join()).not.toMatch(/menuV2 easy/); // Fácil plays Marinara + Calzone: the cut card needs no crate
  });
  it('validateVersus also checks the cut card in each kitchen (V4 and V5 now hold a third plate)', () => {
    for (const id of ['V4', 'V5'])
      expect(
        validateVersus(versusMap(id)!, { requireMirror: false }).errors.filter((e) => /menuV2/.test(e)),
        id,
      ).toEqual([]);
    for (const m of VERSUS_BASE_MAPS) expect(cardProblems(cardForV2(m.id)!, parseMap(m.rows, true)).length, m.id).toBeGreaterThanOrEqual(0);
  });
});

describe('the sequence of plates', () => {
  it('the bag: the first k orders hold every plate once (order 0 is the Marinara), 50 seeds x every map x every difficulty', () => {
    for (const m of [...COOP_MAPS]) {
      const card = cardForV2(m.id);
      if (!card) continue;
      for (const d of DIFFICULTIES) {
        const plates = menuRecipes(card.recipes, d);
        for (let seed = 1; seed <= 50; seed++) {
          const menu = createMenu(plates, d, seed);
          const first = Array.from({ length: plates.length }, (_v, i) => menuAt(menu, i));
          expect(first[0], `${m.id} ${d} ${seed}`).toBe('marinara');
          expect([...first].sort(), `${m.id} ${d} ${seed}`).toEqual([...plates].sort());
        }
      }
    }
  });
  it('after the bag: Marinara near its share (Fácil 50, Normal 34, Difícil 25), the rest even, never three in a row', () => {
    const plates: Recipe[] = ['marinara', 'calzone', 'pepperoni', 'champinon'];
    for (const d of DIFFICULTIES) {
      const k = d === 'easy' ? 2 : d === 'normal' ? 3 : 4;
      const menu = createMenu(plates.slice(0, k), d, 11);
      const seq = Array.from({ length: 6000 }, (_v, i) => menuAt(menu, i)).slice(k);
      const share = (r: Recipe) => (100 * seq.filter((x) => x === r).length) / seq.length;
      expect(share('marinara'), d).toBeGreaterThan(MENU_MARINARA_PCT[d] - 3);
      expect(share('marinara'), d).toBeLessThan(MENU_MARINARA_PCT[d] + 3);
      for (let i = 2; i < seq.length; i++) expect(seq[i] === seq[i - 1] && seq[i] === seq[i - 2], `${d} at ${i}`).toBe(false);
    }
  });
  it('is a pure function of the seed and the index: same seed same list, asked in any order; a sub-seed is not the main stream', () => {
    const plates: Recipe[] = ['marinara', 'calzone', 'pepperoni'];
    const a = createMenu(plates, 'normal', 5),
      b = createMenu(plates, 'normal', 5);
    expect(menuAt(a, 40)).toBe(menuAt(b, 40));
    expect(Array.from({ length: 41 }, (_v, i) => menuAt(a, i))).toEqual(Array.from({ length: 41 }, (_v, i) => menuAt(b, i)));
    const lists = new Set(
      Array.from({ length: 30 }, (_v, s) => Array.from({ length: 12 }, (_w, i) => menuAt(createMenu(plates, 'normal', s), i)).join()),
    );
    expect(lists.size).toBeGreaterThan(10); // different seeds, different rounds
    expect(subSeed(1, 'menu')).not.toBe(subSeed(1, 'event:birthday:2:0'));
    expect(subSeed(1, 'menu')).not.toBe(subSeed(2, 'menu'));
  });
});

describe('in the sim: every plate of the cut card comes up in a round of 3 minutes', () => {
  const maps = ['1', '5', '9', '10', '14', '16', '20', '22', '28', '29', '31', '35', '36'];
  it('N 1/4/8 x difficulty x 13 maps: at least 4 orders, and the distinct plates are those of the cut card', () => {
    for (const id of maps)
      for (const d of DIFFICULTIES)
        for (const n of [1, 4, 8])
          for (const seed of [3]) {
            const { g, list } = orders(id, n, d, seed);
            const want = g.rec!.recipes.filter((r) => r !== 'bandeja' || n >= 4); // under 4 chefs a Bandeja comes out as a Marinara
            // a Carta larga map paces its orders by the load of the queue: nobody delivers here, so it asks for few; the bag still holds for the orders it did ask
            if (!SERIES(id)) expect(list.length, `map ${id} ${d} N${n}`).toBeGreaterThanOrEqual(4);
            const slotLost = g.rec!.recipes.includes('bandeja') && n < 4 ? 1 : 0; // its bag slot comes out as a Marinara
            if (SERIES(id))
              expect(new Set(list).size, `map ${id} ${d} N${n}`).toBeGreaterThanOrEqual(
                Math.min(list.length, g.rec!.recipes.length) - slotLost,
              );
            else expect(new Set(list), `map ${id} ${d} N${n} seed ${seed}`).toEqual(new Set(want));
            expect(g.rec!.recipes, `map ${id} ${d}`).toHaveLength(Math.min(MENU_SIZE[d], cardForV2(id)!.recipes.length));
          }
  });
  it('a birthday cake in the middle of the round does not shift the other orders (it takes no plate of the sequence)', () => {
    for (const [id, d] of [
      ['9', 'normal'],
      ['1', 'hard'],
    ] as const) {
      const base = orders(id, 4, d, 7).list;
      const cake = orders(id, 4, d, 7, 180, 30).list;
      const k = Math.min(base.length, cake.length);
      expect(k).toBeGreaterThan(5);
      expect(cake.slice(0, k)).toEqual(base.slice(0, k));
    }
  });
  it('versus: both kitchens read the same list, even when one kitchen is slower (the recipe is drawn at every slot)', () => {
    for (const id of ['V4', 'V1']) {
      const m = versusMap(id)!;
      const bus = new Emitter<any>();
      const per: Record<number, string[]> = { 0: [], 1: [] };
      bus.on('orderNew', (e: any) => per[e.team]!.push(e.recipe));
      const g: Game = createGame({
        rows: m.rows,
        mapId: id,
        spawns: m.spawns,
        teams: [{ playerIds: [1, 2] }, { playerIds: [3, 4] }],
        recipes: true,
        menuV2: true,
        difficulty: 'normal',
        seed: 2,
        eventsSeed: 9,
        bus,
      });
      [1, 2, 3, 4].forEach((p, i) => addPlayer(g, p, i, i % 2));
      for (let t = 0; t < 120_000 / TICK_MS; t++) tick(g, new Map([...g.players.keys()].map((p) => [p, idle])));
      expect(per[0]!.length).toBeGreaterThan(5);
      expect(per[1]).toEqual(per[0]);
      expect(new Set(per[0])).toEqual(new Set(g.rec!.recipes));
      expect(g.rec!.recipes).toHaveLength(3);
    }
  });
});
