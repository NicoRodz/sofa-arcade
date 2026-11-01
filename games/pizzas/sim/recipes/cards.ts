// The Carta del día: each map brings 2 or 3 recipes instead of all of them (council #7). It is metadata of the map, here by map id; the validator
// (cardCheck.ts) proves every station a recipe needs is on the map and reachable (in versus: in EACH kitchen). A versus round plays one card for both teams.
// Rules of a card: 2 to 4 different recipes, always including the Marinara (the staple: the birthday event orders it and every kitchen can make it), and at
// most one recipe with a topping (the cheese crate gives one topping per round, see defs.ts). Maps 1 to 8 have no cheese crate: their card is Marinara + Calzone.
import type { Card } from './types';
export type { Card } from './types';
import { isRecipe, RECIPE_DEFS, type Recipe } from './defs';

export const CARD_MIN = 2;
export const CARD_MAX = 4; // the Carta larga 9 holds four (the Bandeja draws its plates from the others)

const M: Recipe = 'marinara',
  C: Recipe = 'calzone',
  P: Recipe = 'pepperoni',
  H: Recipe = 'champinon',
  Q: Recipe = 'margarita',
  PQ: Recipe = 'pepqueso',
  JM: Recipe = 'jamchamp',
  MF: Recipe = 'margfresca',
  CR: Recipe = 'calzonerel',
  NO: Recipe = 'nonna',
  BL: Recipe = 'blanca',
  CA: Recipe = 'casa',
  BA: Recipe = 'bandeja';
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
  '20': { recipes: [M, MF, PQ], bind: [2, 3] }, // Carta larga 1: cheese on crate 3, pepperoni on crate 4, basil on 5
  '21': { recipes: [M, H, JM], bind: [5, 4] }, // Carta larga 3: ham on crate 3, mushroom on crate 4
  '22': { recipes: [M, PQ, C], bind: [2, 3] }, // Carta larga 4
  '23': { recipes: [M, Q, H], bind: [2, 4] }, // Carta larga 2: cheese on crate 3, mushroom on crate 4
  '24': { recipes: [M, MF, CR], bind: [2, 5] }, // Carta larga 7: cheese on crate 3, ham on crate 4, basil on 5
  '25': { recipes: [M, NO, H], bind: [2, 4] }, // Carta larga 5 La nonna: mushroom on crate 4, basil on 5, the sauce pot (the design's Margarita fresca does not fit: a card holds three recipes)
  '26': { recipes: [M, BL, NO], bind: [2, 4] }, // Carta larga 6 Pasaplatos: the white pizza takes both crates
  '27': { recipes: [M, CA, CR], bind: [2, 5] }, // Carta larga 8 Isla de hornos: cheese on crate 3, ham on crate 4 (the upgrade of the casa and the stuffing of the calzone)
  '28': { recipes: [M, CA, BA, CR], bind: [2, 5] }, // Carta larga 9 Cocina espejo: the Bandeja takes its three plates from the other three
  V1: { recipes: [M, P, C] },
  V2: { recipes: [M, H, C] },
  V3: { recipes: [M, Q, C] },
  V4: { recipes: [M, P] },
  V5: { recipes: [M, H] },
};

// menuV2 (design pizzas-tanda2 §2): the plates the card holds when the round plays "variety". Maps with one or two plates get a third, from the first of the
// preference list whose stations the map already has (the calzone needs none beyond the basic ones); where none is there, maps/menu-patches.ts adds one
// cheese crate ('3') and the third plate is a Pepperoni. The legacy CARDS above are untouched: a round without the flag plays them bit for bit.
const V2_PAIR_PLUS_PEPPERONI: Card = { recipes: [M, C, P] }; // the maps with no topping crate: the patch adds the '3'
export const CARDS_V2: Readonly<Record<string, Card>> = {
  ...Object.fromEntries(
    ['1', '2', '3', '4', '5', '6', '7', '8', '16', '17', '18', '19', '31', '32', '33', '34', '35'].map((id) => [
      id,
      V2_PAIR_PLUS_PEPPERONI,
    ]),
  ),
  '10': { recipes: [M, H, C] },
  '14': { recipes: [M, P, C] },
  '29': { recipes: [M, Q, C] }, // Taller: the kneader map
  '30': { recipes: [M, H, C] },
  '36': { recipes: [M, P, C] },
  V4: { recipes: [M, P, C] },
  V5: { recipes: [M, H, C] },
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
  if (card.recipes.includes('casa') && !bind?.includes(2)) errors.push('the Pizza de la casa needs the cheese bound to a crate');
  if (card.recipes.includes('bandeja') && card.recipes.length < 3)
    errors.push('the Bandeja needs two other recipes on the card to draw its plates from');
  if (card.recipes.filter((r) => isRecipe(r) && RECIPE_DEFS[r].topping !== null).length > (bind ? 2 : 1))
    errors.push('a card has at most one recipe with a topping (the cheese crate gives one topping)');
  return errors;
}

/** The card of a map under menuV2: the new table where the map has an entry, else the legacy card (the other maps already hold three plates). */
export const cardForV2 = (mapId: string | undefined): Card | undefined => {
  if (mapId === undefined) return undefined;
  const base = mapId.replace(/-vs$/, '');
  return CARDS_V2[mapId] ?? CARDS_V2[base] ?? cardFor(mapId);
};
