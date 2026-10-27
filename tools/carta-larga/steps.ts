// The steps of each recipe for the Carta larga bot (tools/carta-larga/bot.ts runs them). Same walk as games/pizzas/test/golden/recipe-bot.ts, plus: the crate of a topping comes from the card's
// `bind`, the Pizza de la casa carries its three upgrades (ham before the oven, basil and slices after it) and the sauce pot is a step of its own. `null` = the bot does not make that recipe.
import type { Game, Item, Player, Station } from '@pichi/game-pizzas/sim/overcooked';
import { casaMask, CASA_BASIL, CASA_SLICED } from '@pichi/game-pizzas/sim/recipes/casa';
import { RECIPE_DEFS, isDish, type Recipe } from '@pichi/game-pizzas/sim/recipes/defs';

export type At = 'crate0' | 'crate1' | 'crate2' | 'crate3' | 'crate4' | 'board' | 'pot' | 'saucepot' | 'plates' | 'window';
export type Take = 'a' | 'chop' | 'fold' | 'serve';
export interface Step {
  at: At;
  take: Take;
  done: (g: Game, p: Player, s: Station) => boolean;
}
/** A casa plate that carries this upgrade (casaMask is -1 for anything else). */
const upgraded = (i: Item | null, bit: number) => casaMask(i) >= 0 && (casaMask(i) & bit) !== 0;
const cut = (p: Player) => !!p.item && p.item.startsWith('cut');

/** crate -> board (put it down, hold Picar until it is cut, take it) -> `to` (the oven or the sauce pot). */
const prepare = (crate: At, raw: Item, to: At = 'pot'): Step[] => [
  { at: crate, take: 'a', done: (_g, p) => p.item === raw },
  { at: 'board', take: 'a', done: (_g, p) => !p.item },
  { at: 'board', take: 'chop', done: (_g, _p, s) => !!s.item && s.item.startsWith('cut') },
  { at: 'board', take: 'a', done: (_g, p) => cut(p) },
  { at: to, take: 'a', done: (_g, p) => !p.item },
];
/** tomato -> sauce pot, stirred (B held 3 s), the sauce out of the pot and into the oven. */
const sauce = (): Step[] => [
  ...prepare('crate1', 'raw1', 'saucepot'),
  { at: 'saucepot', take: 'chop', done: (_g, _p, s) => s.done },
  { at: 'saucepot', take: 'a', done: (_g, p) => p.item === 'sauce' },
  { at: 'pot', take: 'a', done: (_g, p) => !p.item },
];
const plated = (): Step[] => [
  { at: 'plates', take: 'a', done: (_g, p) => p.item === 'plate' },
  { at: 'pot', take: 'serve', done: (_g, p) => isDish(p.item) },
];
const toWindow: Step = { at: 'window', take: 'a', done: (_g, p) => !p.item };

/** `tomatoFirst`: a card with the Pizza blanca (map 26): bare dough in an oven starts the blanca's base bake and burns at the bell, so the tomato or the sauce goes in BEFORE the dough. */
export function stepsFor(recipe: Recipe, bind: readonly number[] | undefined, tomatoFirst = false): Step[] | null {
  const crateOf = (ing: number): At => (bind && bind[1] === ing ? 'crate3' : 'crate2'); // the topping on the second crate of the bind, else the first
  const raw = (ing: number) => `raw${ing}` as Item;
  const def = RECIPE_DEFS[recipe];
  if (recipe === 'blanca' || recipe === 'bandeja') return null; // the white pizza needs the bell (not scripted yet); the Bandeja is made plate by plate
  if (recipe === 'nonna')
    return [
      ...(tomatoFirst ? [...sauce(), ...prepare('crate0', 'raw0')] : [...prepare('crate0', 'raw0'), ...sauce()]),
      ...plated(),
      { at: 'crate4', take: 'a', done: (_g, p) => p.item === 'dishNB' },
      toWindow,
    ];
  if (recipe === 'casa')
    return [
      ...prepare('crate0', 'raw0'),
      ...prepare(crateOf(2), raw(2)),
      ...prepare(crateOf(5), raw(5)), // the ham goes in before the oven finishes: the first upgrade
      ...sauce(),
      ...plated(),
      { at: 'crate4', take: 'a', done: (_g, p) => upgraded(p.item, CASA_BASIL) },
      { at: 'board', take: 'a', done: (_g, p) => !p.item },
      { at: 'board', take: 'chop', done: (_g, _p, s) => upgraded(s.item, CASA_SLICED) },
      { at: 'board', take: 'a', done: (_g, p) => upgraded(p.item, CASA_SLICED) },
      toWindow,
    ];
  const tops = def.toppings ?? (def.topping !== null ? [def.topping] : []);
  return [
    ...(tomatoFirst ? prepare('crate1', 'raw1') : []),
    ...prepare('crate0', 'raw0'),
    ...tops.flatMap((t) => prepare(crateOf(t), raw(t))),
    ...(tomatoFirst ? [] : prepare('crate1', 'raw1')),
    ...(def.fold ? [{ at: 'pot', take: 'fold', done: (_g: Game, _p: Player, s: Station) => !!s.folded } as Step] : []),
    ...plated(),
    ...(recipe === 'margfresca' ? [{ at: 'crate4', take: 'a', done: (_g: Game, p: Player) => p.item === 'dishQB' } as Step] : []),
    toWindow,
  ];
}
