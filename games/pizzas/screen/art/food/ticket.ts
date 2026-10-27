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

const TOPPING_KIND: Partial<Record<Recipe, FoodKind>> = { margarita: 'cheese_cut', pepperoni: 'pepperoni_cut', champinon: 'mushroom_cut' };

export function recipeParts(s: Phaser.Scene, recipe: Recipe): Phaser.GameObjects.GameObject[] {
  const top = TOPPING_KIND[recipe]; // a topping recipe: three ingredient icons instead of two
  const calzone = recipe === 'calzone';
  const pizza = place(s, foodKey(RECIPE_PIZZA[recipe] as FoodKind), -27, 57, 1).setScale(0.86 / R);
  const dough = place(s, foodKey('dough_str'), 28, top ? (recipe === 'margarita' ? 37 : 35) : 46, 1).setScale((top ? 0.4 : 0.5) / R);
  const tomato = place(s, foodKey('tomato_cut'), 28, top ? (recipe === 'margarita' ? 56 : 52) : 72, 1).setScale((top ? 0.4 : 0.52) / R);
  const topping = top
    ? place(s, foodKey(top), 28, recipe === 'margarita' ? 75 : 69, 1).setScale((recipe === 'margarita' ? 0.4 : 0.44) / R)
    : null;
  // R23: process glyphs, so the ticket reads "cut these, bake them": a knife by the ingredients and a flame on the pizza (the calzone: fold it, and two flames, a long oven)
  const knife = place(s, 'knife', 54, 56, 1)
    .setScale(0.3 / R)
    .setAngle(-65);
  const flames = (calzone ? [-17, -1] : [-9]).map((x) => place(s, 'flame_1', x, 41, 1).setScale((calzone ? 0.3 : 0.34) / R));
  const fold = calzone ? place(s, foodKey('glyph_fold'), 53, 73, 1).setScale(0.34 / R) : null;
  const name = makeText(s, 0, 80, RECIPE_DEFS[recipe].name.toUpperCase(), { size: 12, color: C.cream, stroke: 4, depth: 0 });
  if (name.displayWidth > 108) name.setScale((name.scaleX * 108) / name.displayWidth); // a long name ("CALZONE RELLENO") shrinks to stay inside its ticket
  return [pizza, dough, tomato, ...(topping ? [topping] : []), knife, ...flames, ...(fold ? [fold] : []), name];
}
