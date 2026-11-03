// Hora feliz (F8b): while it runs every pinata reaches one tile further, and a player's pinatas are not capped (they "recharge" at once). Read by the pinata code.
import type { MatchState } from '../match/state';
import { HAPPY_BONUS } from './config';

export const happyOn = (m: MatchState): boolean => m.ev?.active?.kind === 'happyHour';
/** The blast radius bonus a pinata going off now gets. */
export const happyBonus = (m: MatchState): number => (happyOn(m) ? HAPPY_BONUS : 0);
