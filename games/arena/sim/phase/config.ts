// The round in three acts (PR2, flag `phases`). Opening, Scramble and Final depend only on the tick and on the time left, never on a team: both sides get the same act at the same tick.
// Seconds are written once and converted to 60 Hz ticks here. The act is `rawPhase`; the state (`state.ts`) latches it so an act never goes back.
import { TICK_HZ } from '../grid/config';
import { BASE_RADIUS } from '../match/config';

export type Phase = 'opening' | 'scramble' | 'final';
export const PHASES: readonly Phase[] = ['opening', 'scramble', 'final']; // hash order and rank: an act never goes to a lower rank

export const OPENING_PERCENT = 30; // Opening: the first 30 % of the round's BASE length (1350 ticks in 75 s, 1620 in 90 s, 1890 in 105 s)
export const FINAL_TICKS = 18 * TICK_HZ; // Final: the last 18 s, counted from the round's CURRENT end (the Hourglass's extra time moves it)
export const PHASE_WARN_TICKS = 120; // every change is announced (banner + cue) this long before it
export const OPENING_PAIRS = 1; // pickup pairs on the floor at once: Opening 1, Scramble and Final 2 (of the map's 3)
export const BUSY_PAIRS = 2;
export const FAST_RESPAWN_TICKS = 9 * TICK_HZ; // a taken pickup comes back after 9 s instead of 12 s: +33 % faster (12 / 1.33)
export const FINAL_RADIUS_BONUS = 1; // every pinata in the Final reaches one tile further ...
export const RADIUS_CAP = BASE_RADIUS + 3; // ... and no pinata (small-team edge, come-back, Final, Happy hour) goes past the base radius + 3
export const LIVING_SPEED_NUM = 3; // the living parts' clocks run x0.75 in the Final: brush 240 -> 180, sofa 300 -> 225, fountain 480 -> 360
export const LIVING_SPEED_DEN = 4;
export const HIDDEN_MAX_GAP_PP = 6; // the last 10 s are played blind only when the round is this close (pp of the floor) as they begin

export const openingTicks = (base: number): number => Math.floor((base * OPENING_PERCENT) / 100);

/** The act of `tick` in a round that ends at `duration` (its current end) and began with `base` ticks. No state: the same inputs give the same act. */
export function rawPhase(tick: number, duration: number, base: number): Phase {
  if (duration - tick <= FINAL_TICKS) return 'final';
  return tick >= openingTicks(base) ? 'scramble' : 'opening';
}
