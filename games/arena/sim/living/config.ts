// The living map's clock (F5). Seconds are written once and converted to 60 Hz ticks here; the periods are the plan's (brush 4 s, sofa 5 s, fountain 8 s).
import { TICK_HZ, TILE } from '../grid/config';
import type { LivingKind } from '../../map';

export const WARN_TICKS = 1 * TICK_HZ; // every change is announced this long before
export const BRUSH_TICKS = 4 * TICK_HZ; // the bar turns 90 degrees
export const SOFA_TICKS = 5 * TICK_HZ; // the sofa slides to the other end of its rail
export const FOUNTAIN_TICKS = 8 * TICK_HZ; // the fountain splashes
export const FOUNTAIN_RADIUS = 2; // Manhattan: the 12 tiles around its own
export const MAX_PUSH_UNITS = 3 * TILE; // a body is pushed at most this far (1/16 tile) to clear the tiles a part shuts; further and the part waits

export const periodOf = (kind: LivingKind): number => (kind === 'brush' ? BRUSH_TICKS : kind === 'sofa' ? SOFA_TICKS : FOUNTAIN_TICKS);

/** Where in its period the round starts: the spec's `phase` (0..999, drawn from the map substream) scaled so the first change is never closer than its warning. */
export const offsetOf = (kind: LivingKind, phase: number): number => Math.floor((phase * (periodOf(kind) - WARN_TICKS)) / 1000);
