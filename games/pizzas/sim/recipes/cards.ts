// The Carta del día: each map brings 2 or 3 recipes instead of all of them (council #7). It is metadata of the map, here by map id; the validator
// (cardCheck.ts) proves every station a recipe needs is on the map and reachable (in versus: in EACH kitchen). A versus round plays one card for both teams.
// Rules of a card: 2 or 3 different recipes, always including the Marinara (the staple: the birthday event orders it and every kitchen can make it), and at
// most one recipe with a topping (the cheese crate gives one topping per round, see defs.ts). Maps 1 to 8 have no cheese crate: their card is Marinara + Calzone.
import { isRecipe, RECIPE_DEFS, type Recipe } from './defs';

export interface Card {
  recipes: readonly Recipe[];
  bind?: readonly [number, number]; // a map with two topping crates ('3' and '4'): the topping each one gives (2 cheese, 3 pepperoni, 4 mushroom)
}
export const CARD_MIN = 2;
export const CARD_MAX = 3;

const M: Recipe = 'marinara',
  C: Recipe = 'calzone',
  P: Recipe = 'pepperoni',
  H: Recipe = 'champinon',
  Q: Recipe = 'margarita',
  PQ: Recipe = 'pepqueso',
  JM: Recipe = 'jamchamp';
export const CARDS: Readonly<Record<string, Card>> = {
  '1': { recipes: [M, C] },
  '2': { recipes: [M, C] },
  '3': { recipes: [M, C] },
  '4': { recipes: [M, C] },
  '5': { recipes: [M, C] },
  '6': { recipes: [M, C] },
  '7': { recipes: [M, C] },
  '8': { recipes: [M, C] },
  '9': { recipes: [M, P, C] },
  '10': { recipes: [M, H] },
  '11': { recipes: [M, P, C] },
  '12': { recipes: [M, H, C] },
  '13': { recipes: [M, Q, C] },
  '14': { recipes: [M, P] },
  '15': { recipes: [M, H, C] },
  '20': { recipes: [M, Q, PQ], bind: [2, 3] }, // Carta larga 1: cheese on crate 3, pepperoni on crate 4
  '21': { recipes: [M, H, JM], bind: [5, 4] }, // Carta larga 3: ham on crate 3, mushroom on crate 4
  '22': { recipes: [M, PQ, C], bind: [2, 3] }, // Carta larga 4
  V1: { recipes: [M, P, C] },
  V2: { recipes: [M, H, C] },
  V3: { recipes: [M, Q, C] },
  V4: { recipes: [M, P] },
  V5: { recipes: [M, H] },
};

// The surface maps (ice, belts; ids 16-19) play the plain pair: the surface is the twist.
const SURFACE_CARD: Card = { recipes: [M, C] };

/** The card of a map: a derived versus map (`11-vs`) plays the card of the coop map it comes from. Undefined for a generated map. */
export const cardFor = (mapId: string | undefined): Card | undefined =>
  mapId === undefined
    ? undefined
    : (CARDS[mapId] ?? CARDS[mapId.replace(/-vs$/, '')] ?? (/^1[6-9]$/.test(mapId) ? SURFACE_CARD : undefined));

/** The recipe of the card that needs a topping (at most one), if any. */
export const toppingRecipe = (card: Card): Recipe | null => card.recipes.find((r) => RECIPE_DEFS[r].topping !== null) ?? null;

/** Shape problems of a card, independent of any map (the map-dependent ones are in cardCheck.ts). */
export function cardShapeProblems(card: Card): string[] {
  const errors: string[] = [];
  const n = card.recipes.length;
  if (n < CARD_MIN || n > CARD_MAX) errors.push(`a card has ${CARD_MIN} to ${CARD_MAX} recipes, this one has ${n}`);
  if (new Set(card.recipes).size !== n) errors.push('a recipe is twice on the card');
  for (const r of card.recipes) if (!isRecipe(r)) errors.push(`unknown recipe '${String(r)}'`);
  if (!card.recipes.includes('marinara')) errors.push('the card has no Marinara');
  const bind = card.bind;
  for (const r of card.recipes) {
    const two = isRecipe(r) ? RECIPE_DEFS[r].toppings : undefined;
    if (two && !(bind && two.every((t) => bind.includes(t))))
      errors.push(`recipe ${r} needs both toppings ${two.join(' and ')} bound to the two crates`);
    const one = isRecipe(r) ? RECIPE_DEFS[r].topping : null;
    if (bind && one !== null && !bind.includes(one)) errors.push(`recipe ${r} needs topping ${one}, which no crate of the card gives`);
  }
  if (card.recipes.filter((r) => isRecipe(r) && RECIPE_DEFS[r].topping !== null).length > (bind ? 2 : 1))
    errors.push('a card has at most one recipe with a topping (the cheese crate gives one topping)');
  return errors;
}
