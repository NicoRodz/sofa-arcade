// Helpers for the PR3 tests: a round with the sabotages and Rescue/Loot on (F0 map), a body stained by hand or by a real blast, and the rescue state.
import { STUN_TICKS, createManchazo, type ManchazoState, type SabotageKind } from '../../sim';

export { IDLE, put, tick } from '../sabotage/sab-drive';

type Cfg = Parameters<typeof createManchazo>[0];
/** Body i is on team teams[i] (default 0, 1, 0, 1...). */
export const rround = (teams: readonly number[] = [0, 1], seed = 5, extra: Partial<Cfg> = {}): ManchazoState =>
  createManchazo({ slots: teams.map((_t, i) => i), teams, seed, sabotage: true, sabotagePlus: true, rescue: true, ...extra });
export const res = (s: ManchazoState) => s.match.res!;
export const give = (s: ManchazoState, i: number, kind: SabotageKind | null) => (s.match.sab!.held[i] = kind);
/** Stains body i the way a rival blast does at its start (the stun only). */
export const stain = (s: ManchazoState, i: number) => (s.match.bodies[i]!.stun = STUN_TICKS);
/** A rival pinata about to go off on a tile (radius 2): the next tick stains whoever is in its diamond. */
export function blastAt(s: ManchazoState, x: number, y: number, team = 1, owner = 1) {
  s.match.pinatas.push({ id: s.match.nextId++, x, y, team, owner, fuse: 1, radius: 2 });
}
export const lootOf = (s: ManchazoState) => res(s).loot;
