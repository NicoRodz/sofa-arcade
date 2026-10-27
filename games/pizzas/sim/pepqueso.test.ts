// The two-topping pizza (Carta larga, map 20): crate '3' gives the cheese and crate '4' the pepperoni, the oven takes four ingredients, the plate is its own.
import { describe, expect, it } from 'vitest';
import { addPlayer, createGame, type Game, type Order, type Station } from './overcooked';
import { act } from './round/stations';
import { fixedMap } from './maps';
import { cookMsOf, pickOrder } from './recipes/sim';

const make = (mapId = '20'): Game => {
  const m = fixedMap(mapId)!;
  const g = createGame({ rows: m.rows, mapId, recipes: true, spawns: m.spawns });
  addPlayer(g, 1, 0, 0);
  return g;
};
const stationOf = (g: Game, kind: string, crate?: number) =>
  g.stations.find((s) => s.kind === kind && (crate === undefined || s.crate === crate))!;
const order = (recipe: Order['recipe']): Order => ({ id: 1, expiresAt: 1e9, warned: false, recipe });

describe('map 20 and the pepperoni-and-cheese pizza', () => {
  it('the two topping crates give what the card binds: crate 3 cheese, crate 4 pepperoni', () => {
    const g = make();
    const p = g.players.get(1)!;
    act(g, p, stationOf(g, 'crate', 2));
    expect(p.item).toBe('raw2');
    p.item = null;
    act(g, p, stationOf(g, 'crate', 3));
    expect(p.item).toBe('raw3');
  });
  it('the oven takes four ingredients, hands out its own plate, and bakes 1.3x longer; a three-ingredient oven stays a Margarita', () => {
    const g = make();
    const p = g.players.get(1)!;
    const pot = stationOf(g, 'pot') as Station;
    for (const t of [0, 1, 2, 3]) {
      p.item = `cut${t}` as never;
      act(g, p, pot);
      expect(p.item).toBeNull();
    }
    expect(pot.inputs).toEqual([0, 1, 2, 3]);
    expect(cookMsOf(g, pot)).toBeCloseTo(g.params.cookMs * 1.3);
    p.item = 'cut4' as never;
    act(g, p, pot);
    expect(pot.inputs).toHaveLength(4); // a fifth does not go in
    pot.done = true;
    p.item = 'plate';
    act(g, p, pot);
    expect(p.item).toBe('dishPQ');
    pot.inputs.push(0, 1, 2);
    expect(cookMsOf(g, { ...pot, inputs: [0, 1, 2] } as Station)).toBe(g.params.cookMs);
  });
  it('the plate serves its own recipe (and a Marinara), never a Margarita; the order is exact', () => {
    const g = make();
    expect(pickOrder(g, [order('margarita'), order('pepqueso')], 'dishPQ')).toBe(1);
    expect(pickOrder(g, [order('margarita')], 'dishPQ')).toBe(-1);
    expect(pickOrder(g, [order('marinara')], 'dishPQ')).toBe(0);
    expect(pickOrder(g, [order('pepqueso')], 'dishQ')).toBe(-1);
  });
  it('a map without the second crate plays no two-topping recipe', () => {
    const g = make('13');
    expect(g.rec?.topping2 ?? null).toBeNull();
    expect(g.rec?.recipes.includes('pepqueso') ?? false).toBe(false);
  });
});
