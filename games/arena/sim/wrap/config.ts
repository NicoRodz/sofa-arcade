// PR6 (flag `sabotageV2`): the numbers of the Sponge v2 and the packing Tape. Seconds are written once and converted to 60 Hz ticks. Data only.
import { TICK_HZ } from '../grid/config';

export const SPONGE_SOAK_TICKS = 60; // the first B soaks rival paint around you for this long ...
export const SPONGE_HOLD_TICKS = 6 * TICK_HZ; // ... and the second B must come within this many ticks of the first (else it squeezes itself)
export const SPONGE_RADIUS = 2; // Manhattan radius of the diamond it soaks from and squeezes into
export const SPONGE_BIG_AT = 9; // soaked tiles that make the squeeze radius 3 (8 tiles: still 2)
export const SPONGE_BIG_RADIUS = 3;
export const BURST_RADIUS = 2; // a stained, loaded sponge bursts in the attacker's colour
export const TAPE_WINDUP_TICKS = 12; // between the press and the tape landing (the line is drawn on the floor meanwhile)
export const TAPE_LIFE_TICKS = 6 * TICK_HZ;
export const TAPE_LEN = 5; // tiles in the line, perpendicular to the heading
export const TAPE_AHEAD = 2; // tiles in front of the body the line is centred on
export const WRAP_FX_TICKS = 30; // how long the TV flashes a tape that has just landed
