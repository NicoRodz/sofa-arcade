// The plain data of the Carta del día: a Recipe, a Card, a Menu and the Rec the round keeps. A leaf: it imports nothing from the sim, so the round state can hold them without a loop.
import type { Rng } from '@pichi/core';

export type Recipe =
  | 'marinara'
  | 'margarita'
  | 'pepperoni'
  | 'champinon'
  | 'calzone'
  | 'pepqueso'
  | 'jamchamp'
  | 'margfresca'
  | 'calzonerel'
  | 'nonna'
  | 'blanca'
  | 'casa'
  | 'bandeja';
export interface Card {
  recipes: readonly Recipe[];
  bind?: readonly [number, number]; // a map with two topping crates ('3' and '4'): the topping each one gives (2 cheese, 3 pepperoni, 4 mushroom)
}
export interface Menu {
  recipes: readonly Recipe[];
  marinaraPct: number;
  rng: Rng; // the `menu` stream, advanced only while the sequence grows
  seq: Recipe[]; // the plates drawn so far, by order index (shared by every kitchen)
  taken: number[]; // per team id: orders served from the sequence
}
export interface Rec {
  card: Card; // the map's card as it plays (a recipe whose station the map lacks is dropped)
  recipes: readonly Recipe[]; // card.recipes in order, Marinara first
  weights: readonly number[]; // % of the orders of each, same order (they add up to 100)
  topping: number; // ingredient type the cheese crate gives: 2 cheese, 3 pepperoni, 4 mushroom
  topping2: number | null; // the second topping crate ('4'), on a map that has one
  menu?: Menu; // menuV2 only (recipes/menu.ts): the cut card's bag and sequence; absent = one weighted draw per order, as always
}
