// The sauce pot ('R') of the Marinara de la nonna and the Pizza blanca's two-stage oven (Carta larga, tanda 2). Both are inert unless the round's card has the recipe:
// no draw from any RNG, every timer in milliseconds of the sim, so the golden rounds and the mirror proofs never see them.
//   Pot: A with a chopped tomato loads it; B held STIR_MS stirs it into sauce; A with empty hands takes the sauce. Left too long it sticks (Normal 20 s, Hard 12 s,
//   Easy never): A with empty hands scrapes it off and the sauce is lost.
//   Oven: dough alone bakes the base at BASE_COOK_MULT; the bell rings; cheese and mushroom must go in within BELL_MS[difficulty] or the base burns; then the second bake.
import type { Difficulty } from '@pichi/core/difficulty';
import type { Game, Item, Station } from '../round/state';
import { cutType } from './defs';
import { potCapacity } from './sim';

export const STIR_MS = 3000; // of Picar to turn a pot of chopped tomato into sauce
export const STICK_MS: Record<Difficulty, number> = { easy: Infinity, normal: 20_000, hard: 12_000 }; // sauce left in the pot this long sticks
export const SAUCE = 6; // the ingredient type of the sauce inside an oven
export const BASE_COOK_MULT = 0.6; // the first bake of the Pizza blanca (the second one is 1.0x: 1.6x in all)
export const BELL_MS: Record<Difficulty, number> = { easy: 10_000, normal: 6000, hard: 4000 }; // the window the toppings must go in after the bell

export const hasNonna = (g: Pick<Game, 'rec'>) => !!g.rec?.recipes.includes('nonna');
export const hasBlanca = (g: Pick<Game, 'rec'>) => !!g.rec?.recipes.includes('blanca');

/** The ingredient type an item is when it goes into an oven: a chopped ingredient, or the sauce (-1: not an ingredient). */
export const potTypeOf = (item: Item | null): number => (item === 'sauce' ? SAUCE : cutType(item));

/** Is the oven in a state that bakes: dough with a tomato or the sauce, or a stage of the Pizza blanca. Cheese may still go on until it is done. */
export const isBaking = (s: Pick<Station, 'inputs' | 'stage'>): boolean =>
  (s.inputs.includes(0) && (s.inputs.includes(1) || s.inputs.includes(SAUCE))) || s.stage === 'base' || s.stage === 'top';

/** May this ingredient go into the oven now? The old rules, plus: no tomato together with the sauce; nothing more in the top bake; in the bell only cheese and mushroom (or a tomato / the sauce, which turns it into a plain pizza). */
export function canLoad(g: Game, s: Station, t: number): boolean {
  if (t < 0 || s.done || s.folded || s.inputs.includes(t) || s.inputs.length >= potCapacity(g)) return false;
  if (t === 1 && s.inputs.includes(SAUCE)) return false;
  if (t === SAUCE && s.inputs.includes(1)) return false;
  if (s.stage === 'top') return false;
  if (s.stage === 'bell') return t === 2 || t === 4 || t === 1 || t === SAUCE;
  return true;
}

/** After an ingredient went in: the stage of the Pizza blanca moves on (a card with it only). */
export function stageAfterLoad(g: Game, s: Station, t: number) {
  if (!hasBlanca(g)) return;
  if (s.stage === 'bell') {
    if (t === 1 || t === SAUCE) {
      delete s.stage; // a tomato or the sauce: it was an ordinary pizza after all
      delete s.bellLeft;
      s.progress = 0;
    } else if (s.inputs.includes(2) && s.inputs.includes(4)) {
      s.stage = 'top';
      delete s.bellLeft;
      s.progress = 0;
    }
  } else if (s.stage === 'base') {
    delete s.stage; // anything but the bare dough: an ordinary pizza, which waits for its tomato
    s.progress = 0;
  } else if (t === 0 && s.inputs.length === 1) {
    s.stage = 'base';
    s.progress = 0;
  }
}

/** Milliseconds of the bake in this stage, or null when the oven bakes the ordinary way. */
export const stageCookMs = (g: Game, s: Station): number | null =>
  s.stage === 'base' ? g.params.cookMs * BASE_COOK_MULT : s.stage === 'top' ? g.params.cookMs : null;

/** The bake of the base is over: the bell rings and the window opens. */
export function ringBell(g: Game, s: Station) {
  s.stage = 'bell';
  s.progress = 0;
  s.bellLeft = BELL_MS[g.difficulty];
  g.bus.emit('potReady', { station: g.stations.indexOf(s) }); // the bell: the oven loop stops and the ready chime rings
}

/** The window of the bell runs down (not while the lights are out); at zero the bare base burns. */
export function bellTick(g: Game, s: Station, dtMs: number, dark: boolean) {
  if (dark) return;
  s.bellLeft = (s.bellLeft ?? 0) - dtMs;
  if (s.bellLeft > 0) return;
  delete s.bellLeft;
  s.done = true;
  s.burnt = true;
  s.progress = 1;
  g.bus.emit('oven:burnt', { station: g.stations.indexOf(s), ...(g.versus && s.owner !== null ? { team: s.owner } : {}) });
}

// --- the sauce pot ---------------------------------------------------------------------------------------------------------------------------------
/** A at the pot: a chopped tomato in (when the card has the Marinara de la nonna), the sauce out, or the stuck sauce scraped off. */
export function interactSaucepot(g: Game, p: { item: Item | null }, s: Station) {
  if (p.item === 'cut1' && hasNonna(g) && !s.inputs.length && !s.done) {
    s.inputs = [1];
    s.progress = 0;
    p.item = null;
  } else if (!p.item && s.done) {
    if (!s.burnt) p.item = 'sauce';
    clearSaucepot(s);
  }
}
export function clearSaucepot(s: Station) {
  s.inputs = [];
  s.done = false;
  s.progress = 0;
  delete s.readyAt;
  delete s.burnt;
}
/** Can B stir this pot now: a tomato is in and the sauce is not ready. */
export const canStir = (s: Station): boolean => s.kind === 'saucepot' && s.inputs.length > 0 && !s.done && s.fire === undefined;
/** `dtMs` more of Picar stirring; at STIR_MS the sauce is ready. Returns true when it just got ready. */
export function stirStep(g: Game, s: Station, dtMs: number): boolean {
  s.progress += dtMs / STIR_MS;
  if (s.progress < 1) return false;
  s.progress = 1;
  s.done = true;
  s.inputs = [];
  s.readyAt = g.time;
  return true;
}
/** The sauce left in the pot sticks after STICK_MS. */
export function stickTick(g: Game, s: Station) {
  if (s.done && !s.burnt && s.readyAt !== undefined && g.time - s.readyAt >= STICK_MS[g.difficulty]) s.burnt = true;
}
