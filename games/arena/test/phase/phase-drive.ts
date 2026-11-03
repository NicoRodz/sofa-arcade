// Helpers for the PR2 tests: a round with the events and the acts on (F0 map unless a map seed is given), its announcements, and a round stepped to a tick.
import { createManchazo, stepManchazo, type ManchazoInput, type ManchazoState } from '../../sim';

type Cfg = Parameters<typeof createManchazo>[0];
export const phaseRound = (teams: readonly number[] = [0, 1], seed = 3, extra: Partial<Cfg> = {}): ManchazoState =>
  createManchazo({ slots: teams.map((_t, i) => i), teams, seed, events: true, phases: true, ...extra });
/** Players for `n` head counts: 2 -> 75 s, 5 -> 90 s, 7 -> 105 s. */
export const teamsOf = (n: number): number[] => Array.from({ length: n }, (_v, i) => i % 2);
export const quietEvents = (s: ManchazoState): ManchazoState => {
  s.match.ev!.next = s.match.ev!.program.length;
  return s;
};
export const idle = (s: ManchazoState, n = 1, inputs: ReadonlyMap<number, ManchazoInput> = new Map()) => {
  for (let k = 0; k < n; k++) stepManchazo(s, inputs);
};
/** Steps until the round's tick counter reads `t` (the next step runs tick `t`). */
export const toTick = (s: ManchazoState, t: number) => idle(s, t - s.grid.tick);
export const phaseLog = (s: ManchazoState) =>
  s.match.ev!.log.filter((a) => /^(warn|phase)/.test(a.kind)).map((a) => [a.kind, a.tick] as const);
