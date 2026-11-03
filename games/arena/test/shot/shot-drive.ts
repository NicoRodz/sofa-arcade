// Helpers for the PR4 tests: a round with the sabotages, Mareo and Cambiazo and the projectiles on (F0 map, rows 0 and 14 are open from side to side).
import { createManchazo, type ManchazoInput, type ManchazoState } from '../../sim';

export { IDLE, USE, give, put, tick } from '../sabotage/sab-drive';
export { stain } from '../rescue/rescue-drive';

type Cfg = Parameters<typeof createManchazo>[0];
/** Body i is on team teams[i] (default 0, 1). All bodies stand where the F0 map spawns them: `put` them where the test needs. */
export const sround = (teams: readonly number[] = [0, 1], seed = 5, extra: Partial<Cfg> = {}): ManchazoState =>
  createManchazo({ slots: teams.map((_t, i) => i), teams, seed, sabotage: true, sabotagePlus: true, projectiles: true, ...extra });
export const shot = (s: ManchazoState) => s.match.sab!.shot!;
export const hand = (s: ManchazoState, i: number) => s.match.sab!.held[i];
export const plus = (s: ManchazoState) => s.match.sab!.plus!;
export const press = (n = 1): Record<number, ManchazoInput> => ({ [n]: { sx: 0, sy: 0, drop: false, use: true } });
/** Steps until `done()` holds (at most `max` ticks) and returns how many ticks it took; throws when it never does. */
export function until(s: ManchazoState, step: () => void, done: () => boolean, max = 400): number {
  for (let n = 1; n <= max; n++) {
    step();
    if (done()) return n;
  }
  throw new Error(`not reached in ${max} ticks`);
}
