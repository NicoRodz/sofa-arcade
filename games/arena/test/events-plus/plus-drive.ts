// Helpers for the F8b event tests: a round with both event flags on, a program of exactly one event, a map seed whose Mudanza has valid moves.
import { createManchazo, stepManchazo, type EventKind, type ManchazoInput, type ManchazoState } from '../../sim';

export function plusRound(seed = 3, teams: readonly number[] = [0, 1], mapSeed?: number, living = false): ManchazoState {
  return createManchazo({
    slots: teams.map((_t, i) => i),
    teams,
    seed,
    sabotage: true,
    events: true,
    eventsPlus: true,
    ...(living ? { living: true } : {}),
    ...(mapSeed ? { mapSeed } : {}),
  });
}
/** The program is the one event `kind`, starting at tick `at`. */
export function onlyPlus(s: ManchazoState, kind: EventKind, at: number): ManchazoState {
  const ev = s.match.ev!;
  ev.program = [{ kind, at, row: 0, order: [], down: true }];
  ev.next = 0;
  return s;
}
export const run = (s: ManchazoState, n: number, inputs: Record<number, ManchazoInput> = {}) => {
  for (let k = 0; k < n; k++) stepManchazo(s, new Map(Object.entries(inputs).map(([slot, v]) => [Number(slot), v])));
};
/** A map seed (searched from `from`) on which Mudanza has its two valid pairs. */
export function moveSeed(from = 1000, living = false): number {
  for (let m = from; ; m++) if (plusRound(1, [0, 1], m, living).match.ev!.plus!.moves.length === 2) return m;
}
export const solidCopy = (s: ManchazoState) => Array.from(s.grid.map.solid);
