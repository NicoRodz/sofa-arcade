// Cocina escuela, HAZARD_V3: four more steps after the first four, taught one at a time with no clock (design 1.2, steps 5-8): the second dish, the big fire, oil, the rat.
// Pure data and rules, like steps.ts. NOT wired into the session yet (school.ts still runs the first four steps): the session needs a cheese crate, a scripted big fire, a drip and a scripted rat in the
// school kitchen. `SCHOOL_ROWS_V3` is the hall for it. The text of each step is at most 8 words (a test pins it); the TV and the phone show the same line.
import type { IconId } from '@pichi/core';
import { SCHOOL_STEPS, completes, type SchoolEvent, type SchoolStep } from './steps';

export interface SchoolStepV3 extends Omit<SchoolStep, 'id'> {
  id: SchoolStep['id'] | 'second' | 'bigfire' | 'oil' | 'rat';
}
const extra = (id: SchoolStepV3['id'], short: string, text: string, icon: IconId): SchoolStepV3 => ({ id, short, text, icon });
export const SCHOOL_STEPS_V3: readonly SchoolStepV3[] = [
  ...SCHOOL_STEPS,
  extra('second', 'Queso', 'Este lleva queso: cajón amarillo', 'cheese'),
  extra('bigfire', 'Fuego', 'Fuego grande: dos chefs con extintor', 'oven'),
  extra('oil', 'Aceite', 'Resbala. Mantén A para limpiar', 'wash'),
  extra('rat', 'Rata', 'Acorrálala entre dos', 'jump'),
];
export const SCHOOL_TOTAL_V3 = SCHOOL_STEPS_V3.length;

/** What happened in the school kitchen, reduced to what the new steps care about (the first four use steps.ts events). */
export type SchoolEventV3 =
  | SchoolEvent
  | { kind: 'delivered'; item?: string } // the dish that went out: step 5 wants one with cheese
  | { kind: 'fireOut'; chefs: number; big: boolean } // a fire put out and how many chefs were on it
  | { kind: 'wiped' } // oil cleaned
  | { kind: 'ratCaught'; chefs: number }; // the rat scared off, with the chefs close to it

const CHEESE_DISHES = ['dishQ', 'dishPQ', 'dishQB', 'dishCR'];
/** Does this event finish step `step` (0-7)? Steps 0-3 are the original rules. `alone`: a one-chef school (the big fire is a small one then, so one chef is enough). */
export function completesV3(step: number, ev: SchoolEventV3, alone = false): boolean {
  switch (step) {
    case 4:
      return ev.kind === 'delivered' && CHEESE_DISHES.includes((ev as { item?: string }).item ?? '');
    case 5:
      return ev.kind === 'fireOut' && (alone ? true : ev.big && ev.chefs >= 2);
    case 6:
      return ev.kind === 'wiped';
    case 7:
      return ev.kind === 'ratCaught' && (alone || ev.chefs >= 2);
    default:
      return step < 4 && completes(step, ev as SchoolEvent);
  }
}
export const textOfV3 = (step: number): string => SCHOOL_STEPS_V3[step]?.text ?? '';

/** The practice hall of the longer school: a cheese crate in the top wall (3) and a drip (g) on the way from the boards to the ovens. Same 8 spawns and counter lines as SCHOOL_ROWS. */
export const SCHOOL_ROWS_V3: readonly string[] = [
  '#11322KKKCOOCEE#',
  '#..............#',
  '#..............#',
  '#..S..S..S..S..#',
  '#..............#',
  '#..S..S..S..S..#',
  '#..............#',
  '#.........g....#',
  '#11C22KKKCOOCEE#',
];
