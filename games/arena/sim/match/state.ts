// The Manchazo round: the grid world (bodies, F0) plus what F1 adds around it. Kept apart from the grid so F0's sim stays bit for bit what it was.
import { MAP_H, MAP_W, isSolid } from '../../map';
import { RIGHT, type Dir, type GridState } from '../grid';
import { BASE_RADIUS, SMALL_TEAM_RADIUS_BONUS } from './config';

export interface Pinata {
  id: number; // placement order: the order they go off in
  x: number; // tile
  y: number;
  team: number;
  owner: number; // index in grid.bodies
  fuse: number; // ticks left
  radius: number;
}

/** What a body carries besides the grid's own fields. `stun` > 0: stained and still; `trail` > 0: leaving `trailTeam` footprints. */
export interface BodyMatch {
  stun: number;
  trail: number;
  trailTeam: number;
  face: Dir; // last heading (resolves which tile a body on a tile edge stands on)
}

export interface MatchState {
  paint: Int8Array; // per tile (y * MAP_W + x): -1 neutral, else the team
  counts: number[]; // painted tiles per team
  reachedAt: number[]; // tick of each team's last gain: the tie-break
  paintable: number; // floor tiles
  pinatas: Pinata[];
  nextId: number;
  bodies: BodyMatch[]; // same order as grid.bodies
  reserve: number[]; // extra pinatas per team (one per missing player), spent when a player already has MAX_ACTIVE out
  radius: number[]; // blast radius per team
  sizes: number[]; // players per team
}

export interface ManchazoState {
  grid: GridState;
  match: MatchState;
}

/** The small team's edge (handicap 'game'): +1 radius and one reserve pinata per player it lacks next to the biggest team. Even teams: none. */
export function handicap(sizes: readonly number[]): { radius: number[]; reserve: number[] } {
  const big = Math.max(...sizes);
  return {
    radius: sizes.map((n) => BASE_RADIUS + (n < big ? SMALL_TEAM_RADIUS_BONUS : 0)),
    reserve: sizes.map((n) => big - n),
  };
}

export function createMatch(teamOfBody: readonly number[]): MatchState {
  const sizes = [0, 0];
  for (const t of teamOfBody) sizes[t]!++;
  const h = handicap(sizes);
  let paintable = 0;
  for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) if (!isSolid(x, y)) paintable++;
  return {
    paint: new Int8Array(MAP_W * MAP_H).fill(-1),
    counts: [0, 0],
    reachedAt: [0, 0],
    paintable,
    pinatas: [],
    nextId: 0,
    bodies: teamOfBody.map(() => ({ stun: 0, trail: 0, trailTeam: 0, face: RIGHT })),
    reserve: h.reserve,
    radius: h.radius,
    sizes,
  };
}
