// Stars for a round with a Carta del día: table version 2. The star table of stars.ts (version 1: E2 per map x difficulty, calibrated for the 70-point Marinara and
// the 30%-Margarita mix) stays exactly as it was and keeps serving every round without a card. A card changes what an order is worth and how long it takes to
// make, so version 2 is the same table times this factor:
//   (value per unit of effort of the card's mix) / (the same for the old mix of that map: Marinara and, on a cheese map, cheesePct % Margarita)
// Value = the recipe's base points (recipeBase); effort = RECIPE_DEFS[r].effort (how much longer it takes to make than a Marinara). Both mixes use the same
// weights as the orders. With a card like Marinara + Pepperoni + Calzone this is about 0.98; Marinara + Calzone on a map with no cheese about 1.05.
// The efforts are design estimates (no playtest yet): they are the numbers to calibrate with real rounds.
import type { Game } from '../round/state';
import { RECIPE_DEFS, recipeBase, type Recipe } from './defs';

export const STARS_TABLE_LEGACY = 1;
export const STARS_TABLE_CARD = 2;
export const starsTable = (g: Pick<Game, 'rec'>): number => (g.rec ? STARS_TABLE_CARD : STARS_TABLE_LEGACY);

export function recipeStarFactor(g: Pick<Game, 'rec' | 'hasCheese' | 'params'>): number {
  const rec = g.rec;
  if (!rec) return 1;
  const t = g.params.tune;
  const rate = (mix: readonly (readonly [Recipe, number])[]) =>
    mix.reduce((n, [r, w]) => n + w * recipeBase(r, t), 0) / mix.reduce((n, [r, w]) => n + w * RECIPE_DEFS[r].effort, 0);
  const pct = g.hasCheese ? g.params.cheesePct : 0;
  const old = rate([
    ['marinara', 100 - pct],
    ['margarita', pct],
  ]);
  return rate(rec.recipes.map((r, i) => [r, rec.weights[i]!] as const)) / old;
}
