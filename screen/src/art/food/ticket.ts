// What a ticket shows of its recipe (hud.ts builds the ticket around it): the finished pizza, the ingredients in the form they are used (stretched dough, sliced tomato, then the
// topping), the process glyphs (a knife, a flame; the calzone adds the fold arrow and a second flame: the long oven) and the recipe's name, in capitals, as a plain label.
// The pictures differ by SHAPE, not only by colour: the calzone is a half-moon, the pepperoni a row of coins, the mushroom a T, the cheese a heap of shreds.
import Phaser from 'phaser';
import { RECIPE_DEFS, type Recipe } from '@party/shared/recipes/defs';
import { C } from '../tokens';
import { R } from '../gfx';
import { foodKey, type FoodKind } from '../food';
import { place } from '../stations';
import { makeText } from '../fx';
import { RECIPE_PIZZA } from './recipes';

const TOPPING_KIND: Partial<Record<Recipe, FoodKind>> = { margarita: 'cheese_cut', pepperoni: 'pepperoni_cut', champinon: 'mushroom_cut' };

export function recipeParts(s: Phaser.Scene, recipe: Recipe): Phaser.GameObjects.GameObject[] {
  const top = TOPPING_KIND[recipe]; // a topping recipe: three ingredient icons instead of two
  const calzone = recipe === 'calzone';
  const pizza = place(s, foodKey(RECIPE_PIZZA[recipe] as FoodKind), -27, 57, 1).setScale(0.86 / R);
  const dough = place(s, foodKey('dough_str'), 28, top ? 37 : 46, 1).setScale((top ? 0.4 : 0.5) / R);
  const tomato = place(s, foodKey('tomato_cut'), 28, top ? 56 : 72, 1).setScale((top ? 0.4 : 0.52) / R);
  const topping = top ? place(s, foodKey(top), 28, 75, 1).setScale((recipe === 'margarita' ? 0.4 : 0.44) / R) : null;
  // R23: process glyphs, so the ticket reads "cut these, bake them": a knife by the ingredients and a flame on the pizza (the calzone: fold it, and two flames, a long oven)
  const knife = place(s, 'knife', 54, 56, 1).setScale(0.3 / R).setAngle(-65);
  const flames = (calzone ? [-17, -1] : [-9]).map((x) => place(s, 'flame_1', x, 41, 1).setScale((calzone ? 0.3 : 0.34) / R));
  const fold = calzone ? place(s, foodKey('glyph_fold'), 54, 82, 1).setScale(0.42 / R) : null;
  const name = makeText(s, -27, 91, RECIPE_DEFS[recipe].name.toUpperCase(), { size: 11, color: C.muted, stroke: 0, depth: 0 });
  return [pizza, dough, tomato, ...(topping ? [topping] : []), knife, ...flames, ...(fold ? [fold] : []), name];
}
