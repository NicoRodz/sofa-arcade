// The Pizza de la casa (Carta larga, tanda 3; `upgradeOrders` and `sliceAfterBake` on): a plate by stages. The base is dough + sauce + cheese (120 points); every upgrade the chef
// adds is paid on top and raises the tip by 10 %: the ham from the second topping crate BEFORE the oven (+35, the oven takes 1.15x), the basil after it (+25) and the slices
// (B held 1 s on a board with the plate on it, +25). The plate carries its upgrades in the item itself: dishH<mask>, mask = HAM 1 + BASIL 2 + SLICED 4.
// Pure and inert unless the round's card has the recipe: no draw from any RNG, so every golden round stays as it was. Imports nothing but types (recipes/defs.ts imports this file).
import type { Difficulty } from '@pichi/core/difficulty';
import type { Game, Item, Station } from '../round/state';

export const CASA_HAM = 1;
export const CASA_BASIL = 2;
export const CASA_SLICED = 4;
export const UPGRADE_PTS: Record<number, number> = { [CASA_HAM]: 35, [CASA_BASIL]: 25, [CASA_SLICED]: 25 };
export const UPGRADE_TIP = 0.1; // each upgrade adds this share to the tip
export const HAM_COOK_MULT = 1.15; // the oven bakes a casa with ham this much longer
export const SLICE_MS = 1000; // of Picar on a board to cut the plate into portions
export const HARD_MIN_UPGRADES = 2; // Difficult: the order takes only a casa with at least this many upgrades ("two stars")...
export const HARD_BONUS = 1.5; // ...and pays this much more

export const casaDish = (mask: number): Item => `dishH${mask}` as Item;
/** The upgrade mask of a casa plate, -1 for any other item. */
export const casaMask = (i: Item | null): number => (i && /^dishH[0-7]$/.test(i) ? Number(i[5]) : -1);
export const upgradeCount = (mask: number): number => [CASA_HAM, CASA_BASIL, CASA_SLICED].filter((u) => mask & u).length;
export const upgradePoints = (mask: number): number =>
  [CASA_HAM, CASA_BASIL, CASA_SLICED].reduce((n, u) => n + (mask & u ? UPGRADE_PTS[u]! : 0), 0);

export const hasCasa = (g: Pick<Game, 'rec'>) => !!g.rec?.recipes.includes('casa');

/** A pot with dough, sauce and cheese: the base of a casa. The ham (inputs 5) makes the bake longer. */
export const casaCookMult = (g: Pick<Game, 'rec'>, s: Pick<Station, 'inputs'>): number | null =>
  hasCasa(g) && s.inputs.includes(6) && s.inputs.includes(2) ? (s.inputs.includes(5) ? HAM_COOK_MULT : 1) : null;

/** The basil crate on a casa plate: the same plate with the basil on it, or null when it does not apply. */
export function basilOn(g: Pick<Game, 'rec' | 'upgrades'>, item: Item | null): Item | null {
  const m = casaMask(item);
  return g.upgrades && hasCasa(g) && m >= 0 && !(m & CASA_BASIL) ? casaDish(m | CASA_BASIL) : null;
}
/** Portions: a casa plate on a board can be cut into slices once (`sliceAfterBake` on). */
export const canSlice = (g: Pick<Game, 'rec' | 'slices'>, item: Item | null): boolean => {
  const m = casaMask(item);
  return g.slices && hasCasa(g) && m >= 0 && !(m & CASA_SLICED);
};
export const slicedOf = (item: Item): Item => casaDish(casaMask(item) | CASA_SLICED);

/** Does the order of a casa take this plate? Everywhere but Difficult, any casa; on Difficult, one with at least two upgrades. */
export const casaAccepts = (d: Difficulty, item: Item): boolean => d !== 'hard' || upgradeCount(casaMask(item)) >= HARD_MIN_UPGRADES;
/** What a casa plate adds to the order: points of its upgrades, the tip factor, and the Difficult bonus. */
export const casaExtras = (d: Difficulty, item: Item) => {
  const mask = casaMask(item);
  return { points: upgradePoints(mask), tip: 1 + UPGRADE_TIP * upgradeCount(mask), bonus: d === 'hard' ? HARD_BONUS : 1 };
};
