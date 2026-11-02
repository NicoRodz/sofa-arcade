// Helpers for the F8a tests: a duel with the five new sabotages in the deck, and scripted players that press button 2 now and then.
import { mulberry32 } from '@pichi/core';
import { createManchazo, stepManchazo, type ManchazoInput, type ManchazoState } from '../../sim';
import { scripts } from '../match-drive';

export { DROP, IDLE, USE, countsAgree, give, owner, put, sab, stick, tick } from '../sabotage/sab-drive';

/** A round with the sabotages and the F8a ones on, on the F0 map. Body i is on team teams[i] (default 0, 1, 0, 1...). */
export function plusRound(teams: readonly number[] = [0, 1], seed = 5): ManchazoState {
  return createManchazo({ slots: teams.map((_t, i) => i), teams, seed, sabotage: true, sabotagePlus: true });
}
export const plus = (s: ManchazoState) => s.match.sab!.plus!;

/** F1's scripted players plus button 2 about every `every` ticks (the same draws for a run and its mirror). */
export function playUses(s: ManchazoState, seed: number, ticks: number, flip: boolean, every = 90, onTick?: (s: ManchazoState) => void) {
  const ps = scripts(s.grid.bodies.length, seed, flip);
  const use = s.grid.bodies.map((_b, i) => mulberry32(seed * 31 + i * 17));
  for (let t = 0; t < ticks && !s.grid.over; t++) {
    stepManchazo(s, new Map(ps.map((p, i): [number, ManchazoInput] => [s.grid.bodies[i]!.slot, { ...p(), use: use[i]!() < 1 / every }])));
    onTick?.(s);
  }
}
