// Sabotage projectiles (PR4, flag `projectiles`): Pegote, Cambiazo and Mareo are aimed, thrown and dodged. Written in 60 Hz ticks and 1/16-tile units (integers only).
import { TICK_HZ, TILE } from '../grid/config';
import { FUSE_TICKS } from '../match/config';
import type { SabotageKind } from '../sabotage/kinds';

/** The three cards that fly. Everything else (roller, fan, tape, ink, sponge, turpentine, footprints) acts as before. */
export const SHOT_KINDS: readonly SabotageKind[] = ['glue', 'swap', 'dizzy'];
export const isShotKind = (k: SabotageKind | null | undefined): boolean => !!k && SHOT_KINDS.includes(k);

export const AIM_TICKS = 12; // after B: the line shows where it will go, then the shot leaves along the body's heading at that tick
export const SHOT_RANGE_TILES = 7;
export const SHOT_RANGE_UNITS = SHOT_RANGE_TILES * TILE; // 112
export const SHOT_UNITS_PER_TICK = 3; // 11.25 tiles/s: the plan's 1 tile per 6 ticks (2.67 units) rounded to an integer; 38 ticks to cross the whole range
export const SHOT_HIT_UNITS = TILE / 2; // a shot is a point: it hits a body whose 16x16 square holds it (strictly inside) ...
export const SHOT_CLASH_UNITS = TILE / 2; // ... and two rival shots whose points are closer than this on both axes cancel each other
export const GLUE_FUSE_TICKS = Math.max(FUSE_TICKS, 2 * TICK_HZ); // the plan: max(normal fuse, 120)
export const MAX_PASSES = 3; // a Pegote changes hands this many times at most; after that it rides its last carrier
export const PASS_LOCK_TICKS = 30; // after a pass the Pegote cannot be passed again for this long
export const PASS_MIN_FUSE = 45; // a Pegote that is passed never goes off in under this long (0.75 s to react)
