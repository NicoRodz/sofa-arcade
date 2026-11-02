// Manchazo's round rules (F1). Seconds are written once and converted to 60 Hz ticks here; the v1 spec (juego-nuevo.html) fixes the fuse, the chain and the stain.
import { TICK_HZ, ms2ticks } from '../grid/config';

export const BASE_RADIUS = 2; // a pinata paints the diamond of Manhattan radius 2 (13 tiles on open floor)
export const SMALL_TEAM_RADIUS_BONUS = 1; // the smaller team's diamond is radius 3 (2025-11-02 decision)
export const FUSE_TICKS = 2 * TICK_HZ; // the fuse: 2.0 s
export const CHAIN_TICKS = ms2ticks(150); // a pinata caught by another blast goes off 0.15 s later
export const MAX_ACTIVE = 2; // pinatas of one player alive at once; the team's reserve lets it go beyond
export const STUN_TICKS = ms2ticks(1200); // stained: still for 1.2 s
export const TRAIL_TICKS = 3 * TICK_HZ; // then 3 s of footprints in the rival's colour
export const SIDE_SEED_TAG = 0x51de5eed; // substream (seed ^ tag): which side each team starts on this round

/** Round length by the players connected: 2-4 -> 75 s, 5-6 -> 90 s, 7-8 -> 105 s (Nico, 2-nov-2026). */
export const matchSeconds = (connected: number): number => (connected >= 7 ? 105 : connected >= 5 ? 90 : 75);
export const matchTicks = (connected: number): number => matchSeconds(connected) * TICK_HZ;
