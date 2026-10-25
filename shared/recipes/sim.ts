// What the sim does differently in a round with a Carta del día (`createGame({ recipes: true })`). overcooked.ts keeps only one-line hooks into these functions;
// every one of them does exactly what the old code did when `g.rec` is null, which is what keeps the golden rounds and the mirror proofs byte for byte.
//   - the orders draw their recipe from the card (one draw of the team's own stream per slot: both teams of a versus round see twin queues);
//   - the cheese crate gives the topping of the card's recipe (cheese, pepperoni or mushroom);
//   - slicing pepperoni takes longer; a pot with dough and tomato can be FOLDED (hold Picar at the oven) into a calzone, which bakes longer;
//   - the window matches a plate to an order by recipe.
import type { Game, Item, Order, Station } from '../overcooked';
import type { Rng } from '../rng';
import { cardFor, type Card } from './cards';
import { CALZONE_COOK_MULT, FOLD_MS, RAW_OF, RECIPE_DEFS, SLICE_MULT, TOPPING_RECIPE, dishRecipe, type Recipe } from './defs';

export const MARINARA_PCT = 40; // share of the Marinara in the orders; the other recipes of the card split the rest equally

export interface Rec {
  card: Card; // the map's card as it plays (a recipe whose station the map lacks is dropped)
  recipes: readonly Recipe[]; // card.recipes in order, Marinara first
  weights: readonly number[]; // % of the orders of each, same order (they add up to 100)
  topping: number; // ingredient type the cheese crate gives: 2 cheese, 3 pepperoni, 4 mushroom
}

/** The card of the round, or null when the map has none (a generated map): the round then plays the old recipes. `stations`: the sim's, to drop what the grid cannot make. */
export function createRec(stations: readonly Station[], mapId: string | undefined): Rec | null {
  const card = cardFor(mapId);
  if (!card) return null;
  const hasTopping = stations.some((s) => s.kind === 'crate' && s.crate === 2);
  const recipes = card.recipes.filter((r) => hasTopping || RECIPE_DEFS[r].topping === null); // a recipe with a topping needs the crate that gives it
  if (!recipes.includes('marinara')) return null;
  const others = recipes.length - 1;
  const weights = recipes.map((r) => (others === 0 ? 100 : r === 'marinara' ? MARINARA_PCT : (100 - MARINARA_PCT) / others));
  const top = recipes.map((r) => RECIPE_DEFS[r].topping).find((t) => t !== null);
  return { card: { recipes }, recipes, weights, topping: top ?? 2 };
}

/** The recipe of a new order. Old rounds: Margarita on a cheese map with probability cheesePct (a draw only when the map has cheese). Card rounds: one draw by the card's weights. */
export function pickRecipe(g: Game, rng: Rng): Recipe {
  const rec = g.rec;
  if (!rec) return g.hasCheese && rng() * 100 < g.params.cheesePct ? 'margarita' : 'marinara';
  const u = rng() * 100;
  let acc = 0;
  for (let i = 0; i < rec.recipes.length; i++) {
    acc += rec.weights[i]!;
    if (u < acc) return rec.recipes[i]!;
  }
  return rec.recipes[rec.recipes.length - 1]!;
}

/** What a crate gives. Crate type 2 (the cheese crate) gives the card's topping. */
export const crateItem = (g: Game, crate: number): Item => (crate === 2 && g.rec ? RAW_OF[g.rec.topping]! : (RAW_OF[crate] ?? 'raw1'));

/** Ingredient type a topping recipe is (2, 3, 4) -> its recipe. Exposed for the art and the tests. */
export const recipeOfTopping = (t: number): Recipe | undefined => TOPPING_RECIPE[t];

/**
 * The order a plate serves at the window (index into `orders`, or -1: refused). Old rounds: a Margarita fits any VIP and, failing an exact order, the first one
 * of any recipe. Card rounds: a plate serves its own recipe, and a plate with a topping also serves a Marinara; order of preference: the golden order, the
 * birthday order, the exact recipe, then (a topping plate only) a Marinara. A calzone only serves a calzone: no recipe is served by a plate that is not its own.
 */
export function pickOrder(g: Game, orders: readonly Order[], item: Item): number {
  if (!g.rec) {
    const want: Recipe = item === 'dishQ' ? 'margarita' : 'marinara';
    let at = orders.findIndex((o) => o.vip && (o.recipe === want || item === 'dishQ'));
    if (at < 0) at = orders.findIndex((o) => o.birthday && (o.recipe === want || item === 'dishQ')); // the birthday order is the second to be served
    if (at < 0) at = orders.findIndex((o) => o.recipe === want);
    if (at < 0 && item === 'dishQ') at = 0;
    return at;
  }
  const own = dishRecipe(item);
  const topped = item !== 'dish' && item !== 'dishC';
  const fits = (o: Order) => o.recipe === own || (topped && o.recipe === 'marinara');
  let at = orders.findIndex((o) => o.vip && fits(o));
  if (at < 0) at = orders.findIndex((o) => o.birthday && fits(o));
  if (at < 0) at = orders.findIndex((o) => o.recipe === own);
  if (at < 0) at = orders.findIndex(fits);
  return at;
}

// --- the calzone: fold at the oven -------------------------------------------------------------------------------------------------------------------
/** Can this oven be folded now: a card with a calzone, dough and tomato loaded and cooking (nothing else in it, nothing done), not on fire. */
export const canFold = (g: Game, s: Station): boolean =>
  !!g.rec?.recipes.includes('calzone') &&
  s.kind === 'pot' &&
  s.fire === undefined &&
  !s.done &&
  !s.folded &&
  s.inputs.length === 2 &&
  s.inputs.includes(0) &&
  s.inputs.includes(1);

/** `dtMs` more of Picar folding the pot; at FOLD_MS the calzone is folded (it keeps cooking, longer). */
export function foldStep(g: Game, playerId: number, s: Station, dtMs: number) {
  s.fold = (s.fold ?? 0) + dtMs / FOLD_MS;
  if (s.fold < 1) return;
  delete s.fold;
  s.folded = true;
  g.bus.emit('foldDone', { player: playerId, station: g.stations.indexOf(s), ...(g.versus && s.owner !== null ? { team: s.owner } : {}) });
}

/** Milliseconds a full bake of this pot takes: a folded calzone bakes CALZONE_COOK_MULT times longer. */
export const cookMsOf = (g: Game, s: Station): number => (s.folded ? g.params.cookMs * CALZONE_COOK_MULT : g.params.cookMs);
/** Milliseconds of Picar a raw item takes on the board: the pepperoni slices take SLICE_MULT times longer. */
export const cutMsOf = (g: Game, item: Item | null): number => (item === 'raw3' ? g.params.cutMs * SLICE_MULT : g.params.cutMs);
