// The radius rules of the acts: the Final's +1 and the cap on every bonus together. Without the flag (`m.ph` null) nothing here changes a radius.
import type { MatchState } from '../match/state';
import { FINAL_RADIUS_BONUS, RADIUS_CAP } from './config';

export const finalBonus = (m: MatchState): number => (m.ph?.phase === 'final' ? FINAL_RADIUS_BONUS : 0);
export const capRadius = (m: MatchState, r: number): number => (m.ph ? Math.min(r, RADIUS_CAP) : r);
