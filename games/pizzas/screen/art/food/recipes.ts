// The art of the Carta del día: the extra food kinds (textures drawn once by code), which item draws as which, and which picture each recipe wears. food.ts holds the
// original kinds and merges these in; the base pizza and tray are handed in (`BaseArt`) so this file never imports food.ts (no cycle).
import type { Item } from '../../../sim/overcooked';
import type { Recipe } from '../../../sim/recipes/defs';
import { C } from '@pichi/screen-kit/art/tokens';
import type { Ctx } from '@pichi/screen-kit/art/gfx';
import { calzoneDone, calzoneRaw, foldGlyph } from './calzone';
import { BASIL, basilOverlay, basilRaw } from './basil';
import { HAM, hamCut, hamOverlay, hamRaw, hamSquare } from './ham';
import { SAUCE_ITEM_KIND, sauceDraw, type SauceFoodKind } from './sauce-art';
import { MUSHROOM, PEPPERONI, mushroomCut, mushroomRaw, pepperoniCut, pepperoniRaw, toppingOverlay } from './toppings';

export type RecipeFoodKind =
  | 'pepperoni_raw'
  | 'pepperoni_cut'
  | 'mushroom_raw'
  | 'mushroom_cut'
  | 'pizza_raw_p'
  | 'pizza_done_p'
  | 'dish_p'
  | 'pizza_raw_m'
  | 'pizza_done_m'
  | 'dish_m'
  | 'pizza_raw_pq'
  | 'pizza_done_pq'
  | 'dish_pq'
  | 'ham_raw'
  | 'ham_cut'
  | 'pizza_raw_jm'
  | 'pizza_done_jm'
  | 'dish_jm'
  | 'basil_raw'
  | 'calzone_raw_r'
  | 'calzone_done_r'
  | 'dish_cr'
  | 'pizza_done_qb'
  | 'dish_qb'
  | 'calzone_raw'
  | 'calzone_done'
  | 'dish_c'
  | 'glyph_fold'
  | SauceFoodKind;

/** Which kind each new item draws as (the old items keep theirs in food.ts). */
export const EXTRA_ITEM_KIND: Record<
  | 'raw3'
  | 'raw4'
  | 'raw5'
  | 'cut3'
  | 'cut4'
  | 'cut5'
  | 'dishP'
  | 'dishM'
  | 'dishC'
  | 'dishPQ'
  | 'dishJM'
  | 'dishQB'
  | 'dishCR'
  | 'sauce'
  | 'dishN'
  | 'dishNB'
  | 'dishB',
  RecipeFoodKind
> = {
  ...SAUCE_ITEM_KIND,
  raw3: 'pepperoni_raw',
  cut3: 'pepperoni_cut',
  raw4: 'mushroom_raw',
  cut4: 'mushroom_cut',
  dishP: 'dish_p',
  dishM: 'dish_m',
  dishC: 'dish_c',
  dishPQ: 'dish_pq',
  dishJM: 'dish_jm',
  dishQB: 'dish_qb',
  dishCR: 'dish_cr',
  raw5: 'ham_raw',
  cut5: 'ham_cut',
};
export const isRecipeItem = (i: Item): boolean => i in EXTRA_ITEM_KIND;

/** The ingredient colours by type (crate label, chop particles): 3 pepperoni, 4 mushroom. */
export const EXTRA_COLOR: readonly string[] = [PEPPERONI, MUSHROOM, HAM, BASIL];

export interface BaseArt {
  pizzaRaw(c: Ctx, shadow?: boolean, cheese?: boolean): void;
  pizzaDone(c: Ctx, shadow?: boolean, cheese?: boolean): void;
  tray(c: Ctx): void;
}
// The pizza with both toppings: the pepperoni of the one and a second layer of melted cheese on top (pale blobs between the slices).
const cheeseBlobs = (c: Ctx) => {
  c.fillStyle = 'rgba(255,236,160,0.9)';
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + 0.3;
    c.beginPath();
    c.ellipse(Math.cos(a) * 11, Math.sin(a) * 9, 4.2, 2.8, a, 0, Math.PI * 2);
    c.fill();
  }
};
// The stuffed calzone: the same half-moon with the ham and the cheese showing at the crimped edge.
const stuffing = (c: Ctx) => {
  hamSquare(c, -9, -3, 4.6, 0.3);
  hamSquare(c, 8, -1, 4.6, -0.4);
  c.fillStyle = 'rgba(255,236,160,0.95)';
  for (const [x, y] of [
    [-1, -7],
    [0, 4],
    [13, 5],
  ] as const) {
    c.beginPath();
    c.ellipse(x, y, 4, 2.6, 0.3, 0, Math.PI * 2);
    c.fill();
  }
};
export function extraDraw(base: BaseArt): Record<RecipeFoodKind, (c: Ctx) => void> {
  const on = (top: 3 | 4) => ({
    raw: (c: Ctx) => {
      base.pizzaRaw(c, true, true);
      toppingOverlay(c, top, 0.95);
    },
    done: (c: Ctx) => {
      base.pizzaDone(c, true, true);
      toppingOverlay(c, top);
    },
    dish: (c: Ctx) => {
      base.tray(c);
      c.save();
      c.scale(0.82, 0.82);
      base.pizzaDone(c, false, true);
      toppingOverlay(c, top);
      c.restore();
    },
  });
  const p = on(3),
    m = on(4);
  const pq = {
    raw: (c: Ctx) => {
      p.raw(c);
      cheeseBlobs(c);
    },
    done: (c: Ctx) => {
      p.done(c);
      cheeseBlobs(c);
    },
    dish: (c: Ctx) => {
      base.tray(c);
      c.save();
      c.scale(0.82, 0.82);
      base.pizzaDone(c, false, true);
      toppingOverlay(c, 3);
      cheeseBlobs(c);
      c.restore();
    },
  };
  return {
    ...sauceDraw(base),
    pepperoni_raw: pepperoniRaw,
    pepperoni_cut: pepperoniCut,
    mushroom_raw: mushroomRaw,
    mushroom_cut: mushroomCut,
    pizza_raw_p: p.raw,
    pizza_done_p: p.done,
    dish_p: p.dish,
    pizza_raw_m: m.raw,
    pizza_done_m: m.done,
    dish_m: m.dish,
    pizza_raw_pq: pq.raw,
    pizza_done_pq: pq.done,
    dish_pq: pq.dish,
    ham_raw: hamRaw,
    basil_raw: basilRaw,
    calzone_raw_r: (c) => {
      calzoneRaw(c);
      stuffing(c);
    },
    calzone_done_r: (c) => {
      calzoneDone(c);
      stuffing(c);
    },
    dish_cr: (c) => {
      base.tray(c);
      c.save();
      c.scale(0.82, 0.82);
      calzoneDone(c, false);
      stuffing(c);
      c.restore();
    },
    pizza_done_qb: (c) => {
      base.pizzaDone(c, true, true);
      basilOverlay(c);
    },
    dish_qb: (c) => {
      base.tray(c);
      c.save();
      c.scale(0.82, 0.82);
      base.pizzaDone(c, false, true);
      basilOverlay(c);
      c.restore();
    },
    ham_cut: hamCut,
    pizza_raw_jm: (c) => {
      base.pizzaRaw(c, true, true);
      toppingOverlay(c, 4, 0.95);
      hamOverlay(c, 0.95);
    },
    pizza_done_jm: (c) => {
      base.pizzaDone(c, true, true);
      toppingOverlay(c, 4);
      hamOverlay(c);
    },
    dish_jm: (c) => {
      base.tray(c);
      c.save();
      c.scale(0.82, 0.82);
      base.pizzaDone(c, false, true);
      toppingOverlay(c, 4);
      hamOverlay(c);
      c.restore();
    },
    calzone_raw: (c) => calzoneRaw(c),
    calzone_done: (c) => calzoneDone(c),
    dish_c: (c) => {
      base.tray(c);
      c.save();
      c.scale(0.82, 0.82);
      calzoneDone(c, false);
      c.restore();
    },
    glyph_fold: foldGlyph,
  };
}

/** The finished pizza each recipe's ticket and VIP card show. */
export const RECIPE_PIZZA: Record<Recipe, string> = {
  marinara: 'pizza_done',
  margarita: 'pizza_done_q',
  pepperoni: 'pizza_done_p',
  champinon: 'pizza_done_m',
  calzone: 'calzone_done',
  pepqueso: 'pizza_done_pq',
  jamchamp: 'pizza_done_jm',
  margfresca: 'pizza_done_qb',
  calzonerel: 'calzone_done_r',
  nonna: 'pizza_done_nb',
  blanca: 'pizza_done_w',
};
/** The raw and the finished picture of what is in an oven: dough + tomato + the topping, and the calzone once it is folded. */
export function ovenKinds(inputs: readonly number[], folded: boolean): { raw: string; done: string } {
  if (folded) return inputs.length >= 4 ? { raw: 'calzone_raw_r', done: 'calzone_done_r' } : { raw: 'calzone_raw', done: 'calzone_done' };
  if (inputs.includes(6)) return { raw: 'pizza_raw', done: 'pizza_done' }; // the sauce of the pot: the red pizza
  if (!inputs.includes(1) && inputs.includes(2) && inputs.includes(4)) return { raw: 'pizza_raw_w', done: 'pizza_done_w' }; // the white pizza
  if (inputs.includes(4) && inputs.includes(5)) return { raw: 'pizza_raw_jm', done: 'pizza_done_jm' };
  if (inputs.includes(2) && inputs.includes(3)) return { raw: 'pizza_raw_pq', done: 'pizza_done_pq' };
  if (inputs.includes(3)) return { raw: 'pizza_raw_p', done: 'pizza_done_p' };
  if (inputs.includes(4)) return { raw: 'pizza_raw_m', done: 'pizza_done_m' };
  if (inputs.includes(2)) return { raw: 'pizza_raw_q', done: 'pizza_done_q' };
  return { raw: 'pizza_raw', done: 'pizza_done' };
}
export const FOLD_ARROW = C.cheese;
