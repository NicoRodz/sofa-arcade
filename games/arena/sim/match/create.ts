// Builds a Manchazo round: the grid world for the connected players, the teams' handicap, and the round length by head count.
import { mulberry32 } from '@pichi/core';
import { MAP_W, generateMap, f0Map } from '../../map';
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
  sabotage?: boolean; // F3: pickups on the floor and button 2 plays them (off: the round is F1's, bit for bit)
  sabotagePlus?: boolean; // F8a: the five new sabotages join the deck (needs `sabotage`; off: the round is F5's, bit for bit)
  events?: boolean; // F4: the scheduled events, the come-back, the hidden scoreboard and the Hourglass (off: the round is F3's, bit for bit)
  living?: boolean; // F5: the living map (brushes, sofas, fountain) on the generated map; needs `mapSeed` (off: the round is F4's, bit for bit)
  mapSeed?: number; // 25-bit map seed (see map/gen/seed.ts); without it the round is played on the F0 hand-made map
}

/** The side each team starts on: from the round seed (substream SIDE_SEED_TAG), so the same team is not always on the left. Mirror map: both sides are equal. */
export const sidesFlipped = (seed: number): boolean => mulberry32((seed ^ SIDE_SEED_TAG) >>> 0)() < 0.5;

export function createManchazo(cfg: ManchazoConfig): ManchazoState {
  const gen = cfg.mapSeed === undefined ? null : generateMap(cfg.mapSeed, undefined, !!cfg.living);
  const living = cfg.living && gen ? gen.living : undefined; // the fallback has none: its list is empty, the living layer still runs
  const base = gen?.map ?? f0Map();
  const map = living ? { ...base, solid: base.solid.slice() } : base; // the living map shuts and opens tiles: a copy, f0Map() is shared
  const grid = createGrid({
    map,
    slots: cfg.slots,
    teams: cfg.teams,
    ...(cfg.control ? { control: cfg.control } : {}),
    durationTicks: matchTicks(cfg.slots.length),
  });
  if (sidesFlipped(cfg.seed)) for (const b of grid.bodies) b.x = MAP_W * TILE - b.x; // the map is symmetric left-right
  const match = createMatch(
    grid.bodies.map((b) => b.team),
    map,
    cfg.sabotage ? { seed: cfg.seed, plus: !!cfg.sabotagePlus } : undefined,
    cfg.events ? { seed: cfg.seed, base: grid.durationTicks } : undefined,
    living,
  );
  grid.bodies.forEach((b, i) => (match.bodies[i]!.face = b.x < (MAP_W * TILE) / 2 ? RIGHT : LEFT)); // heading to the middle
  return { grid, match, mapSeed: gen?.seed ?? null, mapFallback: gen?.fallback ?? false };
}
