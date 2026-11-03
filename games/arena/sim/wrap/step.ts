// PR6's slot in the tick: with the F8a clocks (`sabotage/plus-step.ts`, after movement): the sponge soaks and squeezes, the tape lands and wears off.
import type { ManchazoState } from '../match/state';
import { stepSponge } from './sponge';
import { stepTape } from './tape';

export function stepWrap(s: ManchazoState): void {
  if (!s.match.sab?.plus?.wrap) return;
  stepTape(s);
  stepSponge(s);
}
