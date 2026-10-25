// The Carta del día over the relay: phones on websockets send the inputs of scripted chefs (games/pizzas/test/golden/recipe-bot.ts), a Node "screen" hosts the coop sim, and the chefs
// cook every new recipe from the raw ingredients: the pepperoni (sliced on the board), the champiñón, and the calzone (folded at the oven by holding Picar through the phone).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RECIPE_DEFS, recipeBase, type Recipe } from '@pichi/game-pizzas/sim/recipes/defs';
import { TUNING } from '@pichi/core/difficulty';
import { decideR, newMem } from '@pichi/game-pizzas/test/golden/recipe-bot';
import { startServer } from '../src/server';
import { kit, playRound } from './rules-kit';

beforeAll(async () => {
  kit.srv = await startServer({ port: 0, mode: 'none' });
});
afterAll(async () => {
  await kit.srv.close();
});

/** Two phones cook `recipe`; every order on the strip asks for it. Returns what happened. */
async function cook(room: string, recipe: Recipe, map: string, seconds = 70) {
  const mem = [newMem(recipe), newMem(recipe)];
  const held = new Set<string>();
  const r = await playRound(room, {
    roles: ['cook', 'cook'],
    seconds,
    map,
    seed: 4,
    flags: { recipes: true },
    setup: (g) => {
      g.teams[0]!.orders = [0, 1, 2, 3].map((id) => ({ id, expiresAt: 1e9, warned: false, recipe }));
    },
    drive: (g, gp, i, frame) => {
      if (gp.item) held.add(gp.item);
      return decideR(g, gp, i, mem[i]!, frame);
    },
  });
  return { r, held, delivered: r.of('delivered'), folds: r.of('foldDone'), starts: r.of('foldStart'), rejected: r.of('dishRejected') };
}

describe('the new recipes over the relay', () => {
  for (const [recipe, map, dish] of [
    ['pepperoni', '9', 'dishP'],
    ['champinon', '12', 'dishM'],
    ['calzone', '9', 'dishC'],
  ] as const) {
    it(`two phones cook ${recipe} on map ${map} from raw ingredients: it is delivered, it pays ${recipeBase(recipe, TUNING.normal)} base and nothing is refused`, async () => {
      const { r, held, delivered, folds, starts, rejected } = await cook(`rc-${recipe}`, recipe, map);
      expect(r.game.over).toBe(true);
      expect(r.game.rec!.recipes).toContain(recipe);
      expect(delivered.length, 'deliveries').toBeGreaterThanOrEqual(2);
      for (const e of delivered) expect(e.p.base).toBe(recipeBase(recipe, TUNING.normal));
      expect(rejected).toHaveLength(0);
      expect(held.has(dish), `a ${dish} was carried to the window`).toBe(true);
      const top = RECIPE_DEFS[recipe].topping;
      if (top !== null)
        expect(held.has(`raw${top}`) && held.has(`cut${top}`), 'the topping was taken from the cheese crate and cut').toBe(true);
      if (RECIPE_DEFS[recipe].fold) {
        expect(folds.length).toBeGreaterThanOrEqual(delivered.length);
        expect(starts.length).toBeGreaterThanOrEqual(folds.length);
      } else {
        expect(folds).toHaveLength(0);
        expect(starts).toHaveLength(0);
      }
      r.close();
    }, 90_000);
  }

  it('a phone that holds Picar at an oven with dough and tomato for FOLD_MS folds the calzone', async () => {
    let step = 0;
    const r = await playRound('rc-fold', {
      roles: ['idle', 'idle'],
      seconds: 12,
      map: '9',
      seed: 4,
      flags: { recipes: true },
      setup: (g) => {
        const o = g.stations.find((s) => s.kind === 'pot')!;
        o.inputs = [0, 1];
      },
      drive: (g, gp, i, frame) => {
        if (i !== 0) return undefined;
        const o = g.stations.find((s) => s.kind === 'pot')!;
        if (!o.folded && frame < 1200) {
          // walk to the oven and hold
          const dx = o.tx + 0.5 - gp.x,
            dy = o.ty + 0.5 - gp.y;
          step++;
          return Math.hypot(dx, dy) > 1.1
            ? { x: dx / Math.hypot(dx, dy), y: dy / Math.hypot(dx, dy), a: 0, b: false }
            : { x: dx, y: dy, a: 0, b: true };
        }
        return undefined;
      },
    });
    expect(r.game.stations.find((s) => s.kind === 'pot')!.folded).toBe(true);
    expect(r.of('foldDone')).toHaveLength(1);
    expect(r.of('foldStart').length).toBeGreaterThanOrEqual(1);
    expect(step).toBeGreaterThan(100);
    r.close();
  }, 60_000);
});
