// "Losing by more than 15 points of area": compared in whole tiles (diff / paintable > 15 %), so 14.9 % never counts and 15.1 % always does.
import type { MatchState } from '../match/state';
import { GAP_PERCENT } from './config';

/** The team losing by more than GAP_PERCENT of the floor, or -1. */
export function losingTeam(m: MatchState): number {
  const [a, b] = [m.counts[0]!, m.counts[1]!];
  if (Math.abs(a - b) * 100 <= GAP_PERCENT * m.paintable) return -1;
  return a < b ? 0 : 1;
}
