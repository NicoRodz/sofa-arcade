// The stuffed calzone (Carta larga, map 24): cheese and ham inside, folded in 3 s, bakes 1.9x, its own plate and order.
import { describe, expect, it } from 'vitest';
import { addPlayer, createGame, type Game, type Order, type Station } from './overcooked';
import { fixedMap } from './maps';
import { canFold, cookMsOf, foldStep, isStuffed, pickOrder } from './recipes/sim';
import { STUFFED_COOK_MULT, STUFFED_FOLD_MS, dishFor } from './recipes/defs';

const make = (mapId = '24'): Game => {
  const m = fixedMap(mapId)!;
  const g = createGame({ rows: m.rows, mapId, recipes: true, spawns: m.spawns });
  addPlayer(g, 1, 0, 0);
  return g;
};
const pot = (g: Game) => g.stations.find((s) => s.kind === 'pot')! as Station;
const order = (recipe: Order['recipe']): Order => ({ id: 1, expiresAt: 1e9, warned: false, recipe });

describe('the stuffed calzone', () => {
  it('can be folded only with dough, tomato, cheese and ham in; a plain calzone card does not fold four ingredients', () => {
    const g = make();
    const s = pot(g);
    s.inputs = [0, 1, 2];
    expect(canFold(g, s)).toBe(false);
    s.inputs = [0, 1, 2, 5];
    expect(isStuffed(g, s)).toBe(true);
    expect(canFold(g, s)).toBe(true);
    s.inputs = [0, 1, 2, 3];
    expect(canFold(g, s)).toBe(false);
    const plain = make('9'); // a card with the plain calzone and no stuffed one
    const q = pot(plain);
    q.inputs = [0, 1, 2, 5];
    expect(canFold(plain, q)).toBe(false);
  });
  it('takes 3 s of Picar to fold and then bakes 1.9x; the plain calzone keeps its 2 s and 1.6x', () => {
    const g = make();
    const s = pot(g);
    s.inputs = [0, 1, 2, 5];
    foldStep(g, 1, s, STUFFED_FOLD_MS - 10);
    expect(s.folded).toBeUndefined();
    foldStep(g, 1, s, 20);
    expect(s.folded).toBe(true);
    expect(cookMsOf(g, s)).toBeCloseTo(g.params.cookMs * STUFFED_COOK_MULT);
  });
  it('gives its own plate, and only its own order takes it (not a Marinara, not the plain calzone)', () => {
    expect(dishFor([0, 1, 2, 5], true)).toBe('dishCR');
    expect(dishFor([0, 1], true)).toBe('dishC');
    const g = make();
    expect(pickOrder(g, [order('marinara'), order('calzonerel')], 'dishCR')).toBe(1);
    expect(pickOrder(g, [order('marinara')], 'dishCR')).toBe(-1);
    expect(pickOrder(g, [order('calzone')], 'dishCR')).toBe(-1);
  });
});
