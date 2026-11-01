// The sauce pot (R) and the Marinara de la nonna (Carta larga, map 25): tomato in, Picar 3 s, sauce out, sauce and dough in the oven, basil on the plate.
import { describe, expect, it } from 'vitest';
import { addPlayer, createGame, tick, type Controls, type Game, type Order, type Station } from './overcooked';
import { act } from './round/stations';
import { fixedMap } from './maps';
import { pickOrder } from './recipes/sim';
import { STICK_MS, STIR_MS } from './recipes/sauce';
import { dishFor } from './recipes/defs';
import { chefHint } from './phone/hints';
import type { Difficulty } from '@pichi/core/difficulty';

const make = (difficulty: Difficulty = 'normal', mapId = '25'): Game => {
  const m = fixedMap(mapId)!;
  const g = createGame({ rows: m.rows, mapId, recipes: true, spawns: m.spawns, difficulty });
  addPlayer(g, 1, 0, 0);
  return g;
};
const pot = (g: Game) => g.stations.find((s) => s.kind === 'saucepot')! as Station;
const order = (recipe: Order['recipe']): Order => ({ id: 1, expiresAt: 1e9, warned: false, recipe });
/** Stand in front of the station (a free floor tile next to it, facing it). */
function face(g: Game, s: Station) {
  const p = g.players.get(1)!;
  const [dx, dy] = [
    [0, 1],
    [0, -1],
    [1, 0],
    [-1, 0],
  ].find(([dx, dy]) => g.grid[s.ty + dy!]?.[s.tx + dx!]?.kind === 'floor')!;
  Object.assign(p, { x: s.tx + dx! + 0.5, y: s.ty + dy! + 0.5, fx: -dx!, fy: -dy!, vx: 0, vy: 0 });
  return p;
}
const hold = (g: Game, ms: number) => {
  const c = new Map<number, Controls>([[1, { x: 0, y: 0, a: 0, b: true }]]);
  for (let t = 0; t < ms / (1000 / 60); t++) tick(g, c);
};
const idle = (g: Game, ms: number) => {
  for (let t = 0; t < ms / (1000 / 60); t++) tick(g, new Map());
};

describe('the sauce pot', () => {
  it('takes a chopped tomato, B held 3 s makes the sauce, empty hands take it', () => {
    const g = make();
    const s = pot(g);
    const p = face(g, s);
    p.item = 'cut0';
    act(g, p, s);
    expect(p.item, 'dough does not go in the pot').toBe('cut0');
    p.item = 'cut1';
    act(g, p, s);
    expect(p.item).toBeNull();
    expect(s.inputs).toEqual([1]);
    hold(g, STIR_MS - 400);
    expect(s.done, 'not yet').toBe(false);
    hold(g, 600);
    expect(s.done).toBe(true);
    act(g, p, s);
    expect(p.item).toBe('sauce');
    expect(s.inputs).toEqual([]);
    expect(s.done).toBe(false);
  });
  it('B with nothing to stir does not stir: an empty pot, or sauce already made', () => {
    const g = make();
    const s = pot(g);
    face(g, s);
    hold(g, 1000);
    expect(s.progress).toBe(0);
  });
  it('the sauce sticks after 20 s on Normal and 12 s on Hard, never on Easy; scraping it loses it', () => {
    expect(STICK_MS).toEqual({ easy: Infinity, normal: 20_000, hard: 12_000 });
    for (const [d, ms] of [
      ['normal', 20_000],
      ['hard', 12_000],
    ] as const) {
      const g = make(d);
      const s = pot(g);
      const p = face(g, s);
      s.done = true;
      s.readyAt = g.time;
      idle(g, ms - 500);
      expect(s.burnt, `${d} before`).toBeUndefined();
      idle(g, 1000);
      expect(s.burnt, `${d} after`).toBe(true);
      act(g, p, s);
      expect(p.item, 'the stuck sauce is lost').toBeNull();
      expect(s.done).toBe(false);
    }
    const easy = make('easy');
    const e = pot(easy);
    e.done = true;
    e.readyAt = easy.time;
    idle(easy, 60_000);
    expect(e.burnt).toBeUndefined();
  });
  it('the pot only takes tomato on a card with the Marinara de la nonna (a map without it is a plain counter for the sim)', () => {
    const g = make('normal', '26');
    const s = pot(g);
    expect(g.rec?.recipes.includes('nonna')).toBe(true);
    const plain = createGame({ rows: fixedMap('25')!.rows, mapId: '25' }); // no card
    const q = pot(plain);
    addPlayer(plain, 1, 0, 0);
    const p = face(plain, q);
    p.item = 'cut1';
    act(plain, p, q);
    expect(p.item).toBe('cut1');
    expect(s.kind).toBe('saucepot');
  });
  it('the buttons say what is possible: tomato in, stir, take the sauce, scrape', () => {
    const g = make();
    const s = pot(g);
    const p = face(g, s);
    p.item = 'cut1';
    expect(chefHint(g, p).a).toBe('Al fuego');
    act(g, p, s);
    expect(chefHint(g, p).b).toBe('Revolver');
    s.done = true;
    expect(chefHint(g, p).a).toBe('Tomar salsa');
    s.burnt = true;
    expect(chefHint(g, p).a).toBe('Raspar');
  });
});

describe('the Marinara de la nonna', () => {
  it('sauce and dough bake (the sauce stands in for the tomato) and come out as the sauce pizza; the tomato and the sauce never share an oven', () => {
    const g = make();
    const oven = g.stations.find((s) => s.kind === 'pot')!;
    const p = face(g, oven);
    p.item = 'cut0';
    act(g, p, oven);
    p.item = 'cut1';
    act(g, p, oven);
    p.item = 'sauce';
    act(g, p, oven);
    expect(p.item, 'no sauce on top of tomato').toBe('sauce');
    oven.inputs = [0];
    act(g, p, oven);
    expect(oven.inputs).toEqual([0, 6]);
    idle(g, g.params.cookMs + 200);
    expect(oven.done).toBe(true);
    expect(dishFor(oven.inputs, false)).toBe('dishN');
  });
  it('the basil goes only on the sauce pizza; a plain Marinara plate stays plain', () => {
    const g = make();
    const basil = g.stations.find((s) => s.kind === 'crate' && s.crate === 4)!;
    const p = face(g, basil);
    p.item = 'dishN';
    act(g, p, basil);
    expect(p.item).toBe('dishNB');
    p.item = 'dish';
    act(g, p, basil);
    expect(p.item, 'a tomato Marinara cannot skip the pot').toBe('dish');
  });
  it('exact matching: the garnished plate serves the nonna order; a sauce plate without basil never does; a nonna order is not served by a Margarita', () => {
    const g = make();
    expect(pickOrder(g, [order('nonna')], 'dishNB')).toBe(0);
    expect(pickOrder(g, [order('nonna')], 'dishN')).toBe(-1);
    expect(pickOrder(g, [order('nonna')], 'dishQB')).toBe(-1);
    expect(pickOrder(g, [order('marinara'), order('nonna')], 'dishNB')).toBe(1);
  });
});
