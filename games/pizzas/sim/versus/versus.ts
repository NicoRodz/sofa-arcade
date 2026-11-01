// Versus kitchens and VIP constants (design pizzas-modalidades-coop-versus §1). Pure: no clock, no I/O.
// A versus map is two kitchens that share no floor. Each team's side is the floor region its chefs start in, regions are taken in
// reading order (team 0 = the region met first), and a station belongs to the team whose region it touches. A station that touches
// no team region, or regions of two teams (the future shared pantry), has no owner (null): everybody can use it.
import type { Difficulty } from '@pichi/core/difficulty';
import { DIRS, floorComponents, isFloor, type Grid, type Pos } from '../maps';
import type { TeamId } from '@pichi/core/lobby/teams';

export const VIP_EVERY_MS: Record<Difficulty, number> = { easy: 75_000, normal: 60_000, hard: 45_000 }; // a VIP order shows up in both queues this often
export const VIP_TTL_MS = 30_000; // patience of a VIP order
export const VIP_MULT = 2; // the delivery that wins the VIP is worth this much (before the handicap k)
// The shared pantry (map V2, design §2): one stock for both kitchens' crates on the barrier. A take lowers it, it fills up again by itself.
export const PANTRY_MAX = 4; // units in stock at the start, and the most it holds
export const PANTRY_EVERY_MS = 6000; // one unit comes back this often while the stock is below the maximum

export interface Kitchens {
  comp: number[][];
  regions: number[];
} // comp: floor region of each tile (-1 off floor); regions[team] = the region of that team

/** The floor regions that hold a start tile ('S', or the explicit spawns), in reading order, one per team. Throws when there are fewer than teams. */
export function kitchenRegions(grid: Grid, teamCount: number, explicit?: readonly Pos[]): Kitchens {
  const { comp } = floorComponents(grid);
  const starts = new Set<number>();
  grid.forEach((row, y) =>
    row.forEach((t, x) => {
      if (t.kind === 'floor' && t.spawn) starts.add(comp[y]![x]!);
    }),
  );
  for (const [x, y] of explicit ?? []) if (isFloor(grid, x, y)) starts.add(comp[y]![x]!);
  const regions = [...starts].sort((a, b) => a - b);
  if (regions.length < teamCount) throw new Error(`${teamCount} teams need ${teamCount} separate kitchens, the map has ${regions.length}`);
  return { comp, regions: regions.slice(0, teamCount) };
}

/** Who owns the station at (tx, ty): the one team whose kitchen it touches, otherwise null (shared). */
export function stationOwner(grid: Grid, k: Kitchens, tx: number, ty: number): TeamId | null {
  const teams = new Set<TeamId>();
  for (const [dx, dy] of DIRS) {
    const x = tx + dx,
      y = ty + dy;
    if (!isFloor(grid, x, y)) continue;
    const t = k.regions.indexOf(k.comp[y]![x]!);
    if (t >= 0) teams.add(t);
  }
  return teams.size === 1 ? [...teams][0]! : null;
}

/** The start tiles inside one team's kitchen, in the order given (reading order of the 'S' tiles when `explicit` is absent). */
export function teamStarts(grid: Grid, k: Kitchens, team: TeamId, explicit?: readonly Pos[]): Pos[] {
  const inside = (x: number, y: number) => isFloor(grid, x, y) && k.comp[y]![x] === k.regions[team];
  if (explicit) return explicit.filter(([x, y]) => inside(x, y)).map(([x, y]): Pos => [x, y]);
  const out: Pos[] = [];
  grid.forEach((row, y) =>
    row.forEach((t, x) => {
      if (t.kind === 'floor' && t.spawn && inside(x, y)) out.push([x, y]);
    }),
  );
  return out;
}
export { iceRound } from './ice-patch'; // VERSUS_V3: the lobby's rows with the patch of ice
