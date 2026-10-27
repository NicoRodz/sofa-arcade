// What a ticket shows of its recipe (hud.ts builds the ticket around it): the finished pizza, the ingredients in the form they are used (stretched dough, sliced tomato, then the
// topping), the process glyphs (a knife, a flame; the calzone adds the fold arrow and a second flame: the long oven) and the recipe's name, in capitals, as a plain label.
// The pictures differ by SHAPE, not only by colour: the calzone is a half-moon, the pepperoni a row of coins, the mushroom a T, the cheese a heap of shreds.
import type Phaser from 'phaser';
import { RECIPE_DEFS, type Recipe } from '../../../sim/recipes/defs';
import { C } from '@pichi/screen-kit/art/tokens';
import { R } from '@pichi/screen-kit/art/gfx';
import { foodKey, type FoodKind } from './kinds';
import { place } from '../stations';
import { makeText } from '@pichi/screen-kit/art/fx';
import { RECIPE_PIZZA } from './recipes';

// The ingredients each recipe uses, in the form they go in (so the ticket does not show a tomato on a white pizza): one column of three or fewer, a 2x2 grid for four.
const D: FoodKind = 'dough_str';
const T: FoodKind = 'tomato_cut';
const Q: FoodKind = 'cheese_cut';
const P: FoodKind = 'pepperoni_cut';
const M: FoodKind = 'mushroom_cut';
const H: FoodKind = 'ham_cut';
const S: FoodKind = 'sauce_blob';
const B: FoodKind = 'basil_raw';
const INGREDIENTS: Record<Recipe, readonly FoodKind[]> = {
  marinara: [D, T],
  margarita: [D, T, Q],
  pepperoni: [D, T, P],
  champinon: [D, T, M],
  calzone: [D, T],
  pepqueso: [D, T, P, Q],
  jamchamp: [D, T, H, M],
  margfresca: [D, T, Q, B],
  calzonerel: [D, T, Q, H],
  nonna: [D, T, S, B],
  blanca: [D, Q, M],
  casa: [D, S, Q],
  bandeja: [],
};
const SPOTS: Record<number, readonly (readonly [number, number, number])[]> = {
  2: [
    [28, 44, 0.5],
    [28, 68, 0.5],
  ],
  3: [
    [28, 35, 0.38],
    [28, 52, 0.38],
    [28, 69, 0.38],
  ],
  4: [
    [14, 40, 0.38],
    [42, 40, 0.38],
    [14, 62, 0.38],
    [42, 62, 0.38],
  ],
};

export function recipeParts(s: Phaser.Scene, recipe: Recipe): Phaser.GameObjects.GameObject[] {
  const calzone = recipe === 'calzone' || recipe === 'calzonerel';
  const pizza = place(s, foodKey(RECIPE_PIZZA[recipe] as FoodKind), -27, 57, 1).setScale(0.86 / R);
  const kinds = INGREDIENTS[recipe];
  const icons = kinds.map((k, i) => {
    const [x, y, sc] = SPOTS[kinds.length]![i]!;
    return place(s, foodKey(k), x, y, 1).setScale(sc / R);
  });
  // R23: process glyphs, so the ticket reads "cut these, bake them": a knife by the ingredients and a flame on the pizza (the calzone: fold it, and two flames, a long oven)
  const knife = place(s, 'knife', 54, 56, 1)
    .setScale(0.3 / R)
    .setAngle(-65);
  const flames = (calzone ? [-17, -1] : [-9]).map((x) => place(s, 'flame_1', x, 41, 1).setScale((calzone ? 0.3 : 0.34) / R));
  const fold = calzone ? place(s, foodKey('glyph_fold'), 53, 73, 1).setScale(0.34 / R) : null;
  const name = makeText(s, 0, 85, RECIPE_DEFS[recipe].name.toUpperCase(), {
    size: 12,
    color: C.cream,
    stroke: 4,
    depth: 0,
  });
  if (name.displayWidth > 108) name.setScale((name.scaleX * 108) / name.displayWidth); // a long name ("CALZONE RELLENO") shrinks to stay inside its ticket
  return [pizza, ...icons, knife, ...flames, ...(fold ? [fold] : []), name];
}
