// What the director may draw in each act. The four big events of F4 only come out in the Scramble; an event that declares nothing can start in any act, as before.
import type { Phase } from './config';

const DECLARED: Readonly<Record<string, readonly Phase[]>> = {
  bigPinata: ['scramble'],
  rain: ['scramble'],
  gold: ['scramble'],
  vacuum: ['scramble'],
};

/** The acts `kind` may start in (undeclared: all of them). */
export const eligiblePhases = (kind: string): readonly Phase[] => DECLARED[kind] ?? ['opening', 'scramble', 'final'];
