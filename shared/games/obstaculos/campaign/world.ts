// Per-world numbers for 2 players (plan §3). D is the validator metric's own scale (0..100): the plan's 0..1 bands x 100.
// Everything else (hearts, checkpoint cadence, coyote/buffer, rescue, hazards) is read by the sim/UI (S1, S3): frozen here as data.
import type { WorldId } from './types';

export interface WorldParams {
  name: string;
  biome: 'beach' | 'forest' | 'glacier' | 'mine' | 'volcano';
  band: readonly [number, number]; // D band
  hearts: number; // Infinity = unlimited
  checkpointSec: number; // a checkpoint about every this many seconds
  coyoteMult: number; // coyote / buffer multiplier
  rescueSec: number; // auto-rescue
  hazardMult: number;
}
export const WORLD: Record<WorldId, WorldParams> = {
  1: { name: 'Playa', biome: 'beach', band: [0, 15], hearts: Infinity, checkpointSec: 15, coyoteMult: 1.5, rescueSec: 1, hazardMult: 0.6 },
  2: { name: 'Bosque', biome: 'forest', band: [15, 35], hearts: 6, checkpointSec: 25, coyoteMult: 1.3, rescueSec: 2, hazardMult: 0.8 },
  3: { name: 'Glaciar', biome: 'glacier', band: [35, 55], hearts: 5, checkpointSec: 30, coyoteMult: 1.15, rescueSec: 3, hazardMult: 0.9 },
  4: { name: 'Mina', biome: 'mine', band: [50, 70], hearts: 5, checkpointSec: 40, coyoteMult: 1.0, rescueSec: 3, hazardMult: 1.0 },
  5: { name: 'Volcán', biome: 'volcano', band: [65, 90], hearts: 4, checkpointSec: 45, coyoteMult: 1.0, rescueSec: 4, hazardMult: 1.1 },
  C: { name: 'Cumbres', biome: 'volcano', band: [85, 100], hearts: 3, checkpointSec: 60, coyoteMult: 0.9, rescueSec: 5, hazardMult: 1.2 },
};

// The metric is an estimate (the Spearman calibration is >= 0.7, not 1): a level is "in band" within this many points of the band's edges.
export const BAND_SLACK = 5;
export const inBand = (world: WorldId, d: number): boolean => d >= WORLD[world].band[0] - BAND_SLACK && d <= WORLD[world].band[1] + BAND_SLACK;

// Campaign rope for 2 players: 20 % longer than the sim's today (plan §5.1). The tower of 2 only beats a solo jump tied thanks to it:
// the solo jump is 3.6 tiles, the 168 px rope holds a climber 3.4 tiles above the base, the longer one 4.1. S1 (A2) puts it in the sim.
export const CAMPAIGN_ROPE_MULT = 1.2;

// Hints (plan §2): a bubble of at most 6 words, at most 2 per level, none in levels 6 and 7 of a world.
export const HINT_MAX_WORDS = 6;
export const HINT_MAX_PER_LEVEL = 2;
export const HINT_FREE_FROM = 6;
