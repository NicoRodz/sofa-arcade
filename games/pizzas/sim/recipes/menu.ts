// menuV2 (design pizzas-tanda2 §2): which plates a round serves and in which order. The card is sorted by effort (Marinara first) and cut by difficulty
// (Fácil 2, Normal 3, Difícil all of it); an initial bag makes every plate come up inside the first k orders; after that a weighted draw with a
// no-three-in-a-row rule. Everything comes from ONE stream sub-seeded by the round (`menu:<seed>`), never from the main RNG, and the sequence is a
// function of the order's index alone: two kitchens of a versus round read the same list at their own pace, so their queues stay twins, and an order
// that does not consume it (the birthday cake, the golden order) cannot shift the others.
import type { Difficulty } from '@pichi/core';
import { mulberry32, type Rng } from '@pichi/core';
import { RECIPE_DEFS, type Recipe } from './defs';

/** How many plates a round serves per difficulty (the card may hold fewer). */
export const MENU_SIZE: Record<Difficulty, number> = { easy: 2, normal: 3, hard: 4 };
/** Share of the orders that are Marinara once the bag is spent; the other plates split the rest equally. */
export const MENU_MARINARA_PCT: Record<Difficulty, number> = { easy: 50, normal: 34, hard: 25 };

/** A sub-stream seed: FNV-1a of the tag mixed with the seed (a tag like `menu`, `event:birthday:2:0`). Pure, no state. */
export function subSeed(seed: number, tag: string): number {
  let h = 0x811c9dc5 ^ (seed >>> 0);
  for (let i = 0; i < tag.length; i++) h = Math.imul(h ^ tag.charCodeAt(i), 0x01000193);
  return (h ^ (h >>> 15)) >>> 0;
}

/** The "signature" plate of a card: the one its special station exists for (Bandeja, then the sauce pot's Nonna, then the Casa, then the Blanca), if the card has one. */
const SIGNATURE_ORDER: readonly Recipe[] = ['bandeja', 'nonna', 'casa', 'blanca'];
export const signatureOf = (card: readonly Recipe[]): Recipe | undefined => SIGNATURE_ORDER.find((r) => card.includes(r));

/**
 * The plates of a round: by effort ascending (stable, the card's own order breaks ties), Marinara first, cut to the difficulty. The cut never drops the
 * signature plate of the card (it would leave its station idle): it takes the place of the costliest of the rest, and the order stays by effort. The Bandeja
 * needs two other plates beside it, so a cut of two (Fácil) cannot hold it and takes the cheapest plates as before.
 */
export function menuRecipes(card: readonly Recipe[], d: Difficulty): Recipe[] {
  const rest = card.filter((r) => r !== 'marinara').sort((x, y) => RECIPE_DEFS[x].effort - RECIPE_DEFS[y].effort);
  const all: Recipe[] = card.includes('marinara') ? ['marinara', ...rest] : rest;
  const size = Math.min(MENU_SIZE[d], all.length);
  const cut = all.slice(0, size);
  const sig = signatureOf(card);
  if (sig === undefined || cut.includes(sig) || (sig === 'bandeja' && size < 3)) return cut;
  cut[size - 1] = sig; // the last slot is the costliest kept plate
  return all.filter((r) => cut.includes(r));
}

export interface Menu {
  recipes: readonly Recipe[];
  marinaraPct: number;
  rng: Rng; // the `menu` stream, advanced only while the sequence grows
  seq: Recipe[]; // the plates drawn so far, by order index (shared by every kitchen)
  taken: number[]; // per team id: orders served from the sequence
}

export function createMenu(recipes: readonly Recipe[], d: Difficulty, seed: number): Menu {
  const rng = mulberry32(subSeed(seed, 'menu'));
  const seq: Recipe[] = [recipes[0]!];
  const rest = recipes.slice(1);
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [rest[i], rest[j]] = [rest[j]!, rest[i]!];
  }
  seq.push(...rest); // the order 0 is plate 0; orders 1..k-1 are a permutation of the others
  return { recipes, marinaraPct: MENU_MARINARA_PCT[d], rng, seq, taken: [] };
}

function grow(m: Menu): void {
  const k = m.recipes.length;
  const others = k - 1;
  const u = m.rng() * 100;
  let at = 0;
  if (others > 0 && u >= m.marinaraPct) at = 1 + Math.min(others - 1, Math.floor(((u - m.marinaraPct) / (100 - m.marinaraPct)) * others));
  const n = m.seq.length;
  if (n >= 2 && m.seq[n - 1] === m.seq[n - 2] && m.seq[n - 1] === m.recipes[at]) at = (at + 1) % k; // the same plate twice already: the next of the card
  m.seq.push(m.recipes[at]!);
}

/** The plate at an order index of the sequence (it grows on demand, always in order, whichever kitchen asks first). */
export function menuAt(m: Menu, index: number): Recipe {
  while (m.seq.length <= index) grow(m);
  return m.seq[index]!;
}

/** The next plate for a team: its own counter over the shared sequence. */
export function menuNext(m: Menu, team: number): Recipe {
  const i = m.taken[team] ?? 0;
  m.taken[team] = i + 1;
  return menuAt(m, i);
}
