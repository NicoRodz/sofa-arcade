// The Manchazo round: the grid world (bodies, F0) plus what F1 adds around it. Kept apart from the grid so F0's sim stays bit for bit what it was.
import { MAP_H, MAP_W, floorCount, footprint, type LivingSpec, type TileMap } from '../../map';
import { RIGHT, type Dir, type GridState } from '../grid';
import type { EventsState } from '../events/state';
import type { Armable } from '../sabotage/kinds';
import { createEvents } from '../events/state';
import { createSabotage, type SabotageState } from '../sabotage/state';
import { createLive, type LiveState } from '../living/state';
import { BASE_RADIUS, SMALL_TEAM_RADIUS_BONUS } from './config';

export interface Pinata {
  id: number; // placement order: the order they go off in
  x: number; // tile
  y: number;
  team: number;
  owner: number; // index in grid.bodies
  fuse: number; // ticks left
  radius: number;
  mod?: Armable; // armed by a sabotage: 'turpentine' erases rival paint instead of painting, 'glue' follows `stuck`
  stuck?: number; // glue: index of the body it is stuck to (x, y follow that body's tile)
}

/** What a body carries besides the grid's own fields. `stun` > 0: stained and still; `trail` > 0: leaving `trailTeam` footprints. */
/** Inclusive tile rectangle. */
export interface GoldZone {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

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
  sab: SabotageState | null; // the sabotages (F3); null when the round plays without them: its sim and its hash are then F1's
  ev: EventsState | null; // the events (F4); null when the round plays without them
  live: LiveState | null; // the living map (F5); null when the round plays without it
  zone: GoldZone | null; // the golden tiles while the event runs: a tile in it weighs GOLD_FACTOR in `counts`
}

export interface ManchazoState {
  grid: GridState;
  match: MatchState;
  mapSeed: number | null; // the seed the map came from (shown on the TV); null for a round on the F0 map that asked for none
  mapFallback: boolean; // the seed did not validate in 64 attempts: the F0 map stands in
}

/** The small team's edge (handicap 'game'): +1 radius and one reserve pinata per player it lacks next to the biggest team. Even teams: none. */
export function handicap(sizes: readonly number[]): { radius: number[]; reserve: number[] } {
  const big = Math.max(...sizes);
  return {
    radius: sizes.map((n) => BASE_RADIUS + (n < big ? SMALL_TEAM_RADIUS_BONUS : 0)),
    reserve: sizes.map((n) => big - n),
  };
}

export function createMatch(
  teamOfBody: readonly number[],
  map: TileMap,
  sabotage?: { seed: number; plus?: boolean },
  events?: { seed: number; base: number; plus?: boolean },
  living?: readonly LivingSpec[],
): MatchState {
  const sizes = [0, 0];
  for (const t of teamOfBody) sizes[t]!++;
  const h = handicap(sizes);
  const paintable = floorCount(map); // every living tile open: a closed one is still a tile of the floor
  const shut = living ? new Set(living.flatMap((l) => footprint(l)).map(([x, y]) => y * MAP_W + x)) : undefined;
  const fountain = !!living?.some((l) => l.kind === 'fountain');
  const sab = sabotage ? createSabotage(map, sabotage.seed, teamOfBody.length, shut, !!sabotage.plus) : null;
  // F8b: Mudanza keeps its hands off the living parts' tiles and the sabotage pickups
  const avoid = new Set([...(shut ?? []), ...(sab?.pickups.map((p) => p.y * MAP_W + p.x) ?? [])]);
  const m: MatchState = {
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
    sab,
    ev: events ? createEvents(map, events.seed, events.base, fountain, events.plus ? { living: living ?? [], avoid } : undefined) : null,
    live: null,
    zone: null,
  };
  if (living) m.live = createLive(map, living); // last: its state 0 shuts tiles of the map the others were built on
  return m;
}
