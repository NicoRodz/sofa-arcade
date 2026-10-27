// The recipes of the "Carta del día" (council #7) as plain data: what each is worth, which stations it needs, which verb it adds.
// Pure and import-light (types only from the sim) so the sim, the validator, the stars and the art can all read it.
//
// Ingredient types (the index the pot's `inputs` and the items raw<N> / cut<N> use): 0 dough, 1 tomato, 2 cheese, 3 pepperoni, 4 mushroom, 5 ham.
// Decision (the brief says "new ingredients in the existing crates when possible"): the cheese crate ('3' on the maps) is the TOPPING crate. In a round
// with a card it gives the topping of the card's recipe: cheese for a Margarita, pepperoni for a Pepperoni, mushroom for a Champiñón. A card has at most
// ONE topping recipe, so no map needs a new tile. Maps without the '3' crate get cards with no topping (Marinara and Calzone).
import type { Item } from '../round/state';
import type { Tuning } from '@pichi/core/difficulty';

export type Recipe =
  | 'marinara'
  | 'margarita'
  | 'pepperoni'
  | 'champinon'
  | 'calzone'
  | 'pepqueso'
  | 'jamchamp'
  | 'margfresca'
  | 'calzonerel';
export const RECIPES: readonly Recipe[] = [
  'marinara',
  'margarita',
  'pepperoni',
  'champinon',
  'calzone',
  'pepqueso',
  'jamchamp',
  'margfresca',
  'calzonerel',
];
export const isRecipe = (v: unknown): v is Recipe => RECIPES.includes(v as Recipe);

export type NeedKey = '1' | '2' | '3' | '4' | '5' | 'K' | 'O' | 'P' | 'E'; // the validator's station keys (validate.ts StationKey): the crates, board, oven, plates, window
export interface RecipeDef {
  name: string; // Spanish, for the ticket and the lobby
  components: number; // ingredients: 20 points each
  processes: number; // processes: 10 points each (stretch / cut / grate / slice each ingredient, fold, bake; a long bake counts double)
  effort: number; // how much longer than a Marinara it takes a chef to make one (an estimate: the stars use it, see stars.ts; to calibrate with playtests)
  topping: number | null; // ingredient type of the topping the recipe needs on top of dough and tomato (null: none)
  toppings?: readonly [number, number]; // a recipe with TWO toppings (both crates of the card): topping stays null, so the one-topping rules of a card do not count it
  fold: boolean; // adds the verb "doblar": hold Picar at the oven with dough and tomato loaded, then it bakes longer
  needs: readonly NeedKey[]; // stations the recipe cannot be made without
}
const BASIC: readonly NeedKey[] = ['1', '2', 'K', 'O', 'P', 'E'];
export const RECIPE_DEFS: Record<Recipe, RecipeDef> = {
  marinara: { name: 'Marinara', components: 2, processes: 3, effort: 1, topping: null, fold: false, needs: BASIC },
  margarita: { name: 'Margarita', components: 3, processes: 4, effort: 1.15, topping: 2, fold: false, needs: [...BASIC, '3'] },
  pepperoni: { name: 'Pepperoni', components: 3, processes: 4, effort: 1.3, topping: 3, fold: false, needs: [...BASIC, '3'] }, // the slices take 1.5x the board time
  champinon: { name: 'Champiñón', components: 3, processes: 4, effort: 1.15, topping: 4, fold: false, needs: [...BASIC, '3'] },
  pepqueso: {
    name: 'Pepperoni y queso',
    components: 4,
    processes: 6,
    effort: 1.9,
    topping: null,
    toppings: [2, 3],
    fold: false,
    needs: [...BASIC, '3', '4'],
  }, // bakes 1.3x
  jamchamp: {
    name: 'Jamón y champiñón',
    components: 4,
    processes: 6,
    effort: 1.8,
    topping: null,
    toppings: [5, 4], // in crate order: crate 3 gives the ham, crate 4 the mushroom
    fold: false,
    needs: [...BASIC, '3', '4'],
  }, // ham 5 + mushroom 4, bakes 1.3x
  margfresca: { name: 'Margarita fresca', components: 4, processes: 5, effort: 1.4, topping: 2, fold: false, needs: [...BASIC, '3', '5'] }, // a Margarita and, after the oven, basil on the plate (A at the basil crate with the plate in hand)
  calzonerel: {
    name: 'Calzone relleno',
    components: 4,
    processes: 11,
    effort: 2.3,
    topping: null,
    toppings: [2, 5],
    fold: true,
    needs: [...BASIC, '3', '4'],
  }, // cheese + ham, folded 3 s, bakes 1.9x
  calzone: { name: 'Calzone', components: 2, processes: 5, effort: 1.2, topping: null, fold: true, needs: BASIC }, // stretch, cut, fold, bake x2 (the long oven)
};
// R13: what a recipe is worth before the tip: points per ingredient plus points per process. Marinara 70, Margarita / Pepperoni / Champiñón 100, Calzone 90.
export const RECIPE_PARTS: Record<Recipe, { components: number; processes: number }> = Object.fromEntries(
  RECIPES.map((r) => [r, { components: RECIPE_DEFS[r].components, processes: RECIPE_DEFS[r].processes }]),
) as Record<Recipe, { components: number; processes: number }>;
export const recipeBase = (r: Recipe, t: Tuning) =>
  RECIPE_PARTS[r].components * t.baseComponent + RECIPE_PARTS[r].processes * t.baseProcess;

// The pizza a topping makes, and the other way round.
export const TOPPING_RECIPE: Readonly<Record<number, Recipe>> = { 2: 'margarita', 3: 'pepperoni', 4: 'champinon' };
export const toppingOf = (r: Recipe): number | null => RECIPE_DEFS[r].topping;

// Items. A crate gives raw<type>; the board turns raw<type> into cut<type>.
export const RAW_OF: readonly Item[] = ['raw0', 'raw1', 'raw2', 'raw3', 'raw4', 'raw5'];
export const CUT_OF: readonly Item[] = ['cut0', 'cut1', 'cut2', 'cut3', 'cut4', 'cut5'];
export const cutOf = (i: Item): Item | null => {
  const t = RAW_OF.indexOf(i);
  return t >= 0 ? CUT_OF[t]! : null;
};
export const cutType = (i: Item | null): number => (i ? CUT_OF.indexOf(i) : -1);

// A pizza on a plate: the marinara dish, the one with a topping (cheese, pepperoni, mushroom) and the folded calzone.
export const DISHES: readonly Item[] = ['dish', 'dishQ', 'dishP', 'dishM', 'dishC', 'dishPQ', 'dishJM', 'dishQB', 'dishCR'];
export const isDish = (i: Item | null): boolean => !!i && DISHES.includes(i);
/** The recipe a plate holds. */
const DISH_RECIPE: Partial<Record<Item, Recipe>> = {
  dishQ: 'margarita',
  dishP: 'pepperoni',
  dishM: 'champinon',
  dishC: 'calzone',
  dishPQ: 'pepqueso',
  dishJM: 'jamchamp',
  dishQB: 'margfresca',
  dishCR: 'calzonerel',
};
export const dishRecipe = (i: Item): Recipe => DISH_RECIPE[i] ?? 'marinara';
/** The plate for a pot's contents (the burnt pizza is another item: the oven decides that first). */
export const dishFor = (inputs: readonly number[], folded: boolean): Item =>
  folded
    ? inputs.length >= 4
      ? 'dishCR'
      : 'dishC'
    : inputs.includes(2) && inputs.includes(3)
      ? 'dishPQ'
      : inputs.includes(4) && inputs.includes(5)
        ? 'dishJM'
        : inputs.includes(3)
          ? 'dishP'
          : inputs.includes(4)
            ? 'dishM'
            : inputs.includes(2)
              ? 'dishQ'
              : 'dish';

export const FOLD_MS = 2000; // of Picar at the oven to fold the calzone
export const STUFFED_FOLD_MS = 3000; // the stuffed calzone (cheese and ham inside) takes this much Picar to fold
export const STUFFED_COOK_MULT = 1.9;
export const CALZONE_COOK_MULT = 1.6; // a folded calzone bakes this much longer
export const TWO_TOPPINGS_COOK_MULT = 1.3; // a pizza with both toppings bakes this much longer
export const SLICE_MULT = 1.5; // slicing the pepperoni takes this much longer than cutting a tomato
