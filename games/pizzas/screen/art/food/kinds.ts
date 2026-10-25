import type { Item } from '../../../sim/overcooked';
import { C } from '@pichi/screen-kit/art/tokens';
import { EXTRA_COLOR, EXTRA_ITEM_KIND, type RecipeFoodKind } from './recipes'; // the Carta del día: pepperoni, mushroom, calzone

export type FoodKind =
  | 'dough_raw'
  | 'dough_str'
  | 'tomato'
  | 'tomato_cut'
  | 'cheese_raw'
  | 'cheese_cut'
  | 'pizza_raw'
  | 'pizza_raw_q'
  | 'pizza_done'
  | 'pizza_done_q'
  | 'pizza_burnt'
  | 'tray'
  | 'tray_dirty'
  | 'dish'
  | 'dish_q'
  | 'dish_burnt'
  | 'box'
  | 'peel'
  | 'bag'
  | RecipeFoodKind;

export const ITEM_KIND: Record<Item, FoodKind> = {
  raw0: 'dough_raw',
  cut0: 'dough_str',
  raw1: 'tomato',
  cut1: 'tomato_cut',
  raw2: 'cheese_raw',
  cut2: 'cheese_cut',
  plate: 'tray',
  dirty: 'tray_dirty',
  dish: 'dish',
  dishQ: 'dish_q',
  burnt: 'dish_burnt',
  trash: 'peel',
  trashBag: 'bag',
  ...EXTRA_ITEM_KIND,
};

export const RAW_KIND: readonly FoodKind[] = ['dough_raw', 'tomato', 'cheese_raw', 'pepperoni_raw', 'mushroom_raw'];

export const CUT_KIND: readonly FoodKind[] = ['dough_str', 'tomato_cut', 'cheese_cut', 'pepperoni_cut', 'mushroom_cut'];

export const ingredientColor = (type: number) =>
  type === 0 ? C.dough : type === 1 ? C.tomato : type === 2 ? C.cheese : (EXTRA_COLOR[type - 3] ?? C.cheese);

export const foodKey = (k: FoodKind) => `it_${k}`;
