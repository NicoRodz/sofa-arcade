// What the sim does differently in a round with a Carta del día (`createGame({ recipes: true })`). round/ keeps only one-line hooks into these functions;
// every one of them does exactly what the old code did when `g.rec` is null, which is what keeps the golden rounds and the mirror proofs byte for byte.
//   - the orders draw their recipe from the card (one draw of the team's own stream per slot: both teams of a versus round see twin queues);
//   - the cheese crate gives the topping of the card's recipe (cheese, pepperoni or mushroom);
//   - slicing pepperoni takes longer; a pot with dough and tomato can be FOLDED (hold Picar at the oven) into a calzone, which bakes longer;
//   - the window matches a plate to an order by recipe.
import type { Rec } from './types';
export type { Rec } from './types';
import type { Game, Item, Order, Station, TeamState } from '../round/state';
import type { Rng, Difficulty } from '@pichi/core';
import { cardFor, cardForV2 } from './cards';
import { createMenu, menuNext, menuRecipes } from './menu';
import { stageCookMs } from './sauce';
import { SLICE_MS, casaAccepts, casaCookMult, casaMask } from './casa';
import { bandejaAllowed, partSlot } from './bandeja';
export { isBaking, potCapacity } from './sauce';
import {
  CALZONE_COOK_MULT,
  FOLD_MS,
  STUFFED_COOK_MULT,
  STUFFED_FOLD_MS,
  RAW_OF,
  RECIPE_DEFS,
  SLICE_MULT,
  TOPPING_RECIPE,
  TWO_TOPPINGS_COOK_MULT,
  dishRecipe,
  isToppedPlate,
  type Recipe,
} from './defs';

export const MARINARA_PCT = 40; // share of the Marinara in the orders; the other recipes of the card split the rest equally

/** The card of the round, or null when the map has none (a generated map): the round then plays the old recipes. `stations`: the sim's, to drop what the grid cannot make. */
export function createRec(
  stations: readonly Station[],
  mapId: string | undefined,
  flags: { upgrades?: boolean; compound?: boolean; menu?: { difficulty: Difficulty; seed: number } } = {},
): Rec | null {
  const v2 = flags.menu;
  const card = v2 ? cardForV2(mapId) : cardFor(mapId);
  if (!card) return null;
  const hasTopping = stations.some((s) => s.kind === 'crate' && s.crate === 2);
  const hasTopping2 = hasTopping && stations.some((s) => s.kind === 'crate' && s.crate === 3);
  const playable = card.recipes.filter(
    (r) =>
      (hasTopping || RECIPE_DEFS[r].topping === null) &&
      (hasTopping2 || !RECIPE_DEFS[r].toppings) && // a recipe with a topping needs the crate that gives it
      (r !== 'casa' || !!flags.upgrades) && // the Pizza de la casa and the Bandeja are behind their flags (casa.ts, bandeja.ts)
      (r !== 'bandeja' || !!flags.compound),
  );
  if (!playable.includes('marinara')) return null;
  const recipes = v2 ? menuRecipes(playable, v2.difficulty) : playable; // menuV2: sorted by effort and cut to the difficulty
  const others = recipes.length - 1;
  const menu = v2 ? createMenu(recipes, v2.difficulty, v2.seed) : undefined;
  const pct = menu?.marinaraPct ?? MARINARA_PCT;
  const weights = recipes.map((r) => (others === 0 ? 100 : r === 'marinara' ? pct : (100 - pct) / others));
  const top = recipes.map((r) => RECIPE_DEFS[r].topping).find((t) => t !== null);
  const bind = hasTopping2 ? card.bind : undefined; // the card says which crate gives which topping
  return {
    card: { recipes, ...(bind ? { bind } : {}) },
    recipes,
    weights,
    topping: bind?.[0] ?? top ?? 2,
    topping2: bind?.[1] ?? null,
    ...(menu ? { menu } : {}),
  };
}

/** The recipe of a new order. Old rounds: Margarita on a cheese map with probability cheesePct (a draw only when the map has cheese). Card rounds: one draw by the card's weights. */
export function pickRecipe(g: Game, rng: Rng, team?: Pick<TeamState, 'orders'> & { id?: number }): Recipe {
  const rec = g.rec;
  if (!rec) return g.hasCheese && rng() * 100 < g.params.cheesePct ? 'margarita' : 'marinara';
  if (rec.menu && team?.id !== undefined) return open(g, menuNext(rec.menu, team.id), team); // menuV2: the team's next plate of the shared sequence (no draw from `rng`)
  const u = rng() * 100;
  let acc = 0;
  for (let i = 0; i < rec.recipes.length; i++) {
    acc += rec.weights[i]!;
    if (u < acc) return open(g, rec.recipes[i]!, team);
  }
  return open(g, rec.recipes[rec.recipes.length - 1]!, team);
}
/** A Bandeja that may not be opened now (none allowed: under 4 chefs, one open already) comes out as a Marinara: the draw was made, nothing more is drawn. */
const open = (g: Game, r: Recipe, team?: Pick<TeamState, 'orders'>): Recipe =>
  r === 'bandeja' && !(team && bandejaAllowed(g, team)) ? 'marinara' : r;

/** What a crate gives. Crate type 2 (the cheese crate) gives the card's topping. */
export const crateItem = (g: Game, crate: number): Item =>
  crate === 2 && g.rec
    ? RAW_OF[g.rec.topping]!
    : crate === 3 && g.rec?.topping2 != null
      ? RAW_OF[g.rec.topping2]!
      : (RAW_OF[crate] ?? 'raw1');

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
  const topped = isToppedPlate(item);
  const fits = (o: Order) =>
    (o.recipe === own && (own !== 'casa' || casaAccepts(g.difficulty, item))) || (topped && o.recipe === 'marinara');
  let at = orders.findIndex((o) => o.vip && fits(o));
  if (at < 0) at = orders.findIndex((o) => o.birthday && fits(o));
  if (at < 0) at = orders.findIndex((o) => partSlot(o, item) >= 0); // a Bandeja takes the plate into one of its slots before a loose order does
  if (at < 0) at = orders.findIndex((o) => o.recipe === own && fits(o));
  if (at < 0) at = orders.findIndex(fits);
  return at;
}

// --- the calzone: fold at the oven -------------------------------------------------------------------------------------------------------------------
/** Can this oven be folded now: a card with a calzone, dough and tomato loaded and cooking (nothing else in it, nothing done), not on fire. */
export const canFold = (g: Game, s: Station): boolean =>
  s.kind === 'pot' &&
  s.fire === undefined &&
  !s.done &&
  !s.folded &&
  ((!!g.rec?.recipes.includes('calzone') && s.inputs.length === 2 && s.inputs.includes(0) && s.inputs.includes(1)) || isStuffed(g, s)); // a plain calzone (dough and tomato) or, on a card with it, the stuffed one (cheese and ham as well)

/** Dough, tomato, cheese and ham in the oven of a card with the stuffed calzone. */
export const isStuffed = (g: Game, s: Station): boolean =>
  !!g.rec?.recipes.includes('calzonerel') && s.inputs.length === 4 && [0, 1, 2, 5].every((t) => s.inputs.includes(t));

/** `dtMs` more of Picar folding the pot; at FOLD_MS the calzone is folded (it keeps cooking, longer). */
export function foldStep(g: Game, playerId: number, s: Station, dtMs: number) {
  s.fold = (s.fold ?? 0) + dtMs / (isStuffed(g, s) ? STUFFED_FOLD_MS : FOLD_MS);
  if (s.fold < 1) return;
  delete s.fold;
  s.folded = true;
  g.bus.emit('foldDone', { player: playerId, station: g.stations.indexOf(s), ...(g.versus && s.owner !== null ? { team: s.owner } : {}) });
}

/** Milliseconds a full bake of this pot takes: a folded calzone bakes CALZONE_COOK_MULT times longer. */
export const cookMsOf = (g: Game, s: Station): number =>
  stageCookMs(g, s) ??
  (casaCookMult(g, s) !== null
    ? g.params.cookMs * casaCookMult(g, s)!
    : s.folded
      ? g.params.cookMs * (s.inputs.length === 4 ? STUFFED_COOK_MULT : CALZONE_COOK_MULT)
      : s.inputs.length === 4
        ? g.params.cookMs * TWO_TOPPINGS_COOK_MULT
        : g.params.cookMs);
/** Milliseconds of Picar a raw item takes on the board: the pepperoni slices take SLICE_MULT times longer. */
export const cutMsOf = (g: Game, item: Item | null): number =>
  casaMask(item) >= 0 ? SLICE_MS : item === 'raw3' ? g.params.cutMs * SLICE_MULT : g.params.cutMs; // a casa plate on a board is being cut into portions
