// Food and items, drawn procedurally at the current ctx origin. One box of 72x72 design units per item.
import type Phaser from 'phaser';
import { makeTex, type Ctx } from '@pichi/screen-kit/art/gfx';
import { extraDraw, type RecipeFoodKind } from './recipes'; // the Carta del día: pepperoni, mushroom, calzone
import { type FoodKind, foodKey } from './kinds';
import { doughRaw, doughStr, tomato, tomatoCut, cheeseRaw, cheeseCut } from './ingredients';
import { pizzaRaw, pizzaDone, pizzaBurnt } from './pizza';
import { tray, trayDirty, dish, dishBurnt } from './dishes';
import { box, peel, bag } from './props';

const DRAW: Record<Exclude<FoodKind, RecipeFoodKind>, (c: Ctx) => void> = {
  dough_raw: doughRaw,
  dough_str: (c) => doughStr(c),
  tomato,
  tomato_cut: tomatoCut,
  cheese_raw: cheeseRaw,
  cheese_cut: cheeseCut,
  pizza_raw: (c) => pizzaRaw(c),
  pizza_raw_q: (c) => pizzaRaw(c, true, true),
  pizza_done: (c) => pizzaDone(c),
  pizza_done_q: (c) => pizzaDone(c, true, true),
  pizza_burnt: (c) => pizzaBurnt(c),
  tray,
  tray_dirty: trayDirty,
  dish: (c) => dish(c),
  dish_q: (c) => dish(c, true),
  dish_burnt: dishBurnt,
  box,
  peel,
  bag,
};

// the extra kinds are built on first use (they draw with the base pizza and tray of this file, which are all defined by then)
let extra: Record<RecipeFoodKind, (c: Ctx) => void> | null = null;

const drawerOf = (k: FoodKind): ((c: Ctx) => void) =>
  k in DRAW ? DRAW[k as keyof typeof DRAW] : (extra ??= extraDraw({ pizzaRaw, pizzaDone, tray }))[k as RecipeFoodKind];

export const drawFood = (c: Ctx, k: FoodKind) => drawerOf(k)(c);

export function buildFoodTextures(scene: Phaser.Scene) {
  const kinds = [...Object.keys(DRAW), ...Object.keys(extraDraw({ pizzaRaw, pizzaDone, tray }))] as FoodKind[];
  for (const k of kinds) makeTex(scene, foodKey(k), { w: 84, h: 92, oy: 40 }, drawerOf(k));
}
