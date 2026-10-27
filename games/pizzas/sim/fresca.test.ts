// Margarita fresca (Carta larga, map 20): basil goes onto a baked Margarita on its plate; the two plates serve only their own order.
import { describe, expect, it } from 'vitest';
import { addPlayer, createGame, type Game, type Order } from './overcooked';
import { act } from './round/stations';
import { fixedMap } from './maps';
import { pickOrder } from './recipes/sim';

const make = (mapId = '20'): Game => {
  const m = fixedMap(mapId)!;
  const g = createGame({ rows: m.rows, mapId, recipes: true, spawns: m.spawns });
  addPlayer(g, 1, 0, 0);
  return g;
};
const order = (recipe: Order['recipe']): Order => ({ id: 1, expiresAt: 1e9, warned: false, recipe });
const basil = (g: Game) => g.stations.find((s) => s.kind === 'crate' && s.crate === 4)!;

describe('the basil', () => {
  it('garnishes a baked Margarita on its plate and nothing else; empty hands get nothing', () => {
    const g = make();
    const p = g.players.get(1)!;
    act(g, p, basil(g));
    expect(p.item).toBeNull();
    p.item = 'dishQ';
    act(g, p, basil(g));
    expect(p.item).toBe('dishQB');
    for (const item of ['dish', 'dishP', 'plate', 'cut2'] as const) {
      p.item = item;
      act(g, p, basil(g));
      expect(p.item).toBe(item);
    }
  });
  it('the garnish needs the recipe on the card: a map without it leaves the plate alone', () => {
    const g = make('23'); // La terraza has no basil crate and no fresca
    const p = g.players.get(1)!;
    p.item = 'dishQ';
    expect(g.rec?.recipes.includes('margfresca') ?? false).toBe(false);
    expect(g.stations.some((s) => s.kind === 'crate' && s.crate === 4)).toBe(false);
  });
  it('a fresca plate serves a fresca order, never a plain Margarita one; a plain Margarita never serves a fresca order', () => {
    const g = make();
    expect(pickOrder(g, [order('margarita'), order('margfresca')], 'dishQB')).toBe(1);
    expect(pickOrder(g, [order('margarita')], 'dishQB')).toBe(-1);
    expect(pickOrder(g, [order('margfresca')], 'dishQ')).toBe(-1);
  });
});
