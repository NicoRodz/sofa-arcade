// Builds a Manchazo round: the grid world for the connected players, the teams' handicap, and the round length by head count.
import { mulberry32 } from '@pichi/core';
import { MAP_W } from '../../map';
import { LEFT, RIGHT } from '../grid/dir';
import { TILE, type ControlPlan } from '../grid/config';
import { createGrid } from '../grid/state';
import { SIDE_SEED_TAG, matchTicks } from './config';
import { createMatch, type ManchazoState } from './state';

export interface ManchazoConfig {
  slots: readonly number[]; // connected players, 2 to 8
  teams: readonly number[]; // team (0 or 1) of each slot, same order as `slots`
  seed: number;
  control?: ControlPlan;
}

/** The side each team starts on: from the round seed (substream SIDE_SEED_TAG), so the same team is not always on the left. Mirror map: both sides are equal. */
export const sidesFlipped = (seed: number): boolean => mulberry32((seed ^ SIDE_SEED_TAG) >>> 0)() < 0.5;

export function createManchazo(cfg: ManchazoConfig): ManchazoState {
  const grid = createGrid({
    slots: cfg.slots,
    teams: cfg.teams,
    ...(cfg.control ? { control: cfg.control } : {}),
    durationTicks: matchTicks(cfg.slots.length),
  });
  if (sidesFlipped(cfg.seed)) for (const b of grid.bodies) b.x = MAP_W * TILE - b.x; // the map is symmetric left-right
  const match = createMatch(grid.bodies.map((b) => b.team));
  grid.bodies.forEach((b, i) => (match.bodies[i]!.face = b.x < (MAP_W * TILE) / 2 ? RIGHT : LEFT)); // heading to the middle
  return { grid, match };
}
