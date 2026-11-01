// Cocina escuela (council M2): the guided practice round before the first match. Four steps, no timer, no score, every chef at its own pace.
// This file is the data and the pure rules of one chef's progress: which events finish a step, which item belongs in the hands at each step,
// which phone button to light. The session that runs them over the real sim is school.ts.
import type { IconId } from '@pichi/core';
import type { Item } from '../round/state';
import type { StationKind } from '../maps';

export interface SchoolStep {
  id: 'dough' | 'tomato' | 'oven' | 'serve';
  short: string;
  text: string;
  icon: IconId;
}
// text: what the phone says (at most 8 words, a test pins it). short: the name in the TV's strip.
export const SCHOOL_STEPS: readonly SchoolStep[] = [
  { id: 'dough', short: 'Masa', text: 'Toma masa del cajón', icon: 'dough' },
  { id: 'tomato', short: 'Tomate', text: 'Toma tomate y pícalo en la tabla', icon: 'chop' },
  { id: 'oven', short: 'Horno', text: 'Lleva el tomate picado al horno', icon: 'oven' },
  { id: 'serve', short: 'Entrega', text: 'Entrega la pizza en la ventanilla', icon: 'bell' },
];
export const SCHOOL_TOTAL = SCHOOL_STEPS.length;
export const DONE_TEXT = 'Aléjate y toca B para correr'; // a chef that finished: the dash is the one thing left to try (B with free hands and nothing in front)
export const ALL_DONE_TEXT = '¡Todos listos!';
export const KNOWN_TEXT = 'Ya la hiciste. Toca B para correr'; // a chef that skipped: it did not play the steps (the phone remembers the school, or its player pressed Saltar)
export const SCHOOL_TITLE = 'Cocina escuela';
export const SCHOOL_SUB = 'Sin tiempo ni puntos · cada quien a su ritmo';
export const SCHOOL_SUB_VERSUS = 'Equipos juntos, sin competir · cada quien a su ritmo';

/** Progress of one chef: step = the step it is on (0-based); SCHOOL_TOTAL = finished. */
export interface Prog {
  step: number;
  skipped: boolean;
}
export const fresh = (): Prog => ({ step: 0, skipped: false });
export const isDone = (p: Prog | undefined): boolean => !!p && p.step >= SCHOOL_TOTAL;
export const advance = (p: Prog): Prog => ({ step: Math.min(SCHOOL_TOTAL, p.step + 1), skipped: p.skipped });
/** A chef that already knows (the phone said so, or it pressed "Saltar"): finished, and marked as skipped. */
export const skipped = (): Prog => ({ step: SCHOOL_TOTAL, skipped: true });
/** The school ends when somebody is connected and everybody connected is done. */
export function allDone(prog: ReadonlyMap<number, Prog>, connected: readonly number[]): boolean {
  return connected.length > 0 && connected.every((id) => isDone(prog.get(id)));
}

/** What happened in the sim, reduced to what a step cares about. */
export type SchoolEvent =
  | { kind: 'picked'; item: Item; from: StationKind }
  | { kind: 'chopped'; item: Item | null } // the item the board holds after the chop
  | { kind: 'dropped'; item: Item; at: StationKind }
  | { kind: 'delivered' };

/** Does this event finish step `step`? Taking dough from the crate; chopping a tomato; putting a chopped tomato in the oven; delivering a pizza. */
export function completes(step: number, ev: SchoolEvent): boolean {
  switch (step) {
    case 0:
      return ev.kind === 'picked' && ev.item === 'raw0' && ev.from === 'crate';
    case 1:
      return ev.kind === 'chopped' && ev.item === 'cut1';
    case 2:
      return ev.kind === 'dropped' && ev.item === 'cut1' && ev.at === 'pot';
    case 3:
      return ev.kind === 'delivered';
    default:
      return false;
  }
}

/** The items that belong in a chef's hands at each step. Anything else is taken away after a moment (nobody stays stuck holding the wrong thing). */
export function wantedItems(step: number): readonly Item[] {
  switch (step) {
    case 0:
      return ['raw0'];
    case 1:
      return ['raw1'];
    case 2:
      return ['cut1'];
    case 3:
      return ['dish'];
    default:
      return ['raw0', 'raw1', 'raw2', 'cut0', 'cut1', 'cut2', 'plate', 'dish']; // done: free to play around
  }
}
/** The item a chef is given back when its hands are empty at the step (a chopped tomato it put down, the pizza it left on a counter); null: it fetches its own. */
export const regrantItem = (step: number): Item | null => (step === 2 ? 'cut1' : step === 3 ? 'dish' : null);

/**
 * The button the phone lights up. A is almost always it; B while there is a raw ingredient under the knife (the hint says so: Picar, icon chop, not greyed) and, once the chef
 * is done, B for the dash (the hint says Correr: B on).
 */
export function focusButton(step: number, hint: { bIcon?: string; bOff?: boolean; b?: string | null }): 'a' | 'b' {
  if (step >= SCHOOL_TOTAL) return 'b';
  if (step === 1 && !hint.bOff && hint.bIcon === 'chop' && hint.b !== 'Picar primero') return 'b';
  return 'a';
}

/** What a phone is told about its chef: the instruction, which step, and the button to light. */
export function instruction(prog: Prog | undefined, everyoneDone: boolean): { step: number; text: string; done: boolean } {
  const step = prog?.step ?? 0;
  if (step >= SCHOOL_TOTAL)
    return { step: SCHOOL_TOTAL, done: true, text: everyoneDone ? ALL_DONE_TEXT : prog?.skipped ? KNOWN_TEXT : DONE_TEXT };
  return { step, done: false, text: SCHOOL_STEPS[step]!.text };
}
