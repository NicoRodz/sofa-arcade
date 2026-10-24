// F2a tuning that is not in constants.ts (constants.ts belongs to F1; F2 only reads it). Numbers of plan §4, §5, §6, §8, §9 that
// the plan leaves open are marked "assumed": change them here, nowhere else.
import { TILE } from '../constants';

export const SLOT_COUNT = 8;

// ids of the non-player platforms (players use their slot, 0..7)
export const BOX_ID0 = 100;
export const MOVER_ID0 = 200;
export const BALANCE_ID0 = 300;

// --- grabbing (plan §5)
export const GRAB_RANGE = 0.9 * TILE; // distance from the body box to the target
export const BOX_SIZE = 44; // px, light and heavy
export const HEAVY_GRIPS = 2; // players that must hold the heavy box 'X' for it to move
export const HOLD_BREAK = 1.7 * TILE; // a held box farther than this from its holder is dropped
export const THROW_VX = 420; // px/s, plan §2
export const THROW_VY = -950;
export const THROWN_MAX_STEPS = 90; // a thrown player has no control until landing, or this long
export const LIFT_GAP = 2; // px between the holder's head and the lifted player
export const HAND_LIFT_SEC = 0.4; // plan §5 mano amiga
export const PLANT_AIR_STEPS = 8; // a planted player pulled off the ground for this long stops being planted (assumed)
export const RING_HANG_DY = 8; // px: the anchored body hangs with its top this far above the ring centre (assumed)

// --- environment
export const BELT_SPEED = 120; // px/s (assumed)
export const CLIMB_SPEED = 170; // px/s (assumed)
export const CLIMB_SIDE_MULT = 0.45; // sideways speed on a ladder, x RUN_SPEED (assumed)
export const TIDE_PERIOD_SEC = 8; // plan §10 level 3
export const FREEZE_SEC = 3; // plan §10 level 14: a checkpoint freezes the lava
export const AVALANCHE_START_TILES = 4; // the wall starts this many tiles left of the level (assumed)
export const KEY_REACH = 6; // px around the key holder that opens a door (assumed)

// --- rules (plan §6, §8)
export const RESPAWN_DELAY_SEC = 1; // a dead player waits this long, then returns at the checkpoint (assumed)
export const REUNION_TILES = 24; // checkpoint pulls whoever is farther behind than this in progress distance (assumed: about a screen)
export const GOAL_PAD_X = 0.5 * TILE; // the goal zone is its cell grown by this sideways...
export const GOAL_PAD_Y = 1 * TILE; // ...and this upwards (assumed)
export const STAR_STREAK_SEC = 3; // stars picked up within this of each other are a streak (assumed)
export const CRUMB_KEEP = 12;
export const CRUSH_STEPS = 2; // inside a solid for this many steps in a row = crushed
export const VOID_MARGIN = TILE; // below the grid by this much = fell
export const SPAWN_SPREAD = 18; // px between players at the spawn (assumed)
