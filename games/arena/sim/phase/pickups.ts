// The act decides how many sabotage pairs stand on the floor and how fast a taken one comes back. Pairs are ranked by index among those the map has.
import type { MatchState } from '../match/state';
import { BUSY_PAIRS, FAST_RESPAWN_TICKS, OPENING_PAIRS } from './config';

/** Whether the pickups of mirror pair `pair` are out now: the first pair in the Opening, the first two from the Scramble on (no flag: all). */
export function pairOut(m: MatchState, pair: number): boolean {
  if (!m.ph || !m.sab) return true;
  const pairs = [...new Set(m.sab.pickups.map((p) => p.pair))].sort((a, b) => a - b);
  return pairs.indexOf(pair) < (m.ph.phase === 'opening' ? OPENING_PAIRS : BUSY_PAIRS);
}

/** Ticks a pickup taken now takes to come back: `normal` in the Opening and without the flag, 9 s after. */
export const respawnTicks = (m: MatchState, normal: number): number => (m.ph && m.ph.phase !== 'opening' ? FAST_RESPAWN_TICKS : normal);
