// Helpers for the PR6 tests: a round with the sabotages, the F8a ones and the sponge v2 / packing tape on (F0 map: rows 0 and 14 are open from side to side).
import { createManchazo, type ManchazoState } from '../../sim';

export { DROP, IDLE, USE, countsAgree, give, owner, put, sab, stick, tick } from '../sabotage/sab-drive';
export { blastAt } from '../rescue/rescue-drive';

type Cfg = Parameters<typeof createManchazo>[0];
/** Body i is on team teams[i] (default 0, 1). */
export const wrapRound = (teams: readonly number[] = [0, 1], seed = 5, extra: Partial<Cfg> = {}): ManchazoState =>
  createManchazo({ slots: teams.map((_t, i) => i), teams, seed, sabotage: true, sabotagePlus: true, sabotageV2: true, ...extra });
export const plus = (s: ManchazoState) => s.match.sab!.plus!;
export const wrap = (s: ManchazoState) => s.match.sab!.plus!.wrap!;
/** Heading of body i: 0 right, 1 down, 2 left, 3 up. */
export const face = (s: ManchazoState, i: number, dir: 0 | 1 | 2 | 3) => {
  s.match.bodies[i]!.face = dir;
};
/** Sorted "x,y" of the tiles of the strips on the floor. */
export const taped = (s: ManchazoState): string[] =>
  wrap(s)
    .strips.flatMap((t) => t.tiles.map((i) => `${i % 27},${Math.floor(i / 27)}`))
    .sort();
