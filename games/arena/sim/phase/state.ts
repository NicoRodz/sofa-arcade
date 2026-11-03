// What the acts add to a round: the act in force, the change already announced, and whether the last 10 s are played blind. `null` in the match when the round plays without the flag.
import { PHASES, type Phase } from './config';

export interface PhaseState {
  base: number; // the round's base ticks (the Opening's end never moves with the Hourglass's extra time)
  phase: Phase; // latched: it only goes up
  warned: number; // the tick of the change whose warning was already announced (-1: none); a change that moves (Hourglass) is announced again
  hidden: boolean | null; // null until the last 10 s begin; then: was the round close enough to play them blind
}

export const createPhase = (base: number): PhaseState => ({ base, phase: 'opening', warned: -1, hidden: null });
export const phaseWords = (p: PhaseState): number[] => [PHASES.indexOf(p.phase), p.warned, p.hidden === null ? -1 : p.hidden ? 1 : 0];
