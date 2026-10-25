// Fairness numbers of a versus map: what each kitchen costs to work in, and how far apart the two are.
import { DIRS, isFloor, posKey, type Grid, type Pos } from '../maps';
import { accessTiles, legsOf, stationsOf, type StationKey } from './stations';
import { floorTiles } from './reachability';

// BFS distance over floor tiles from a set of tiles; Infinity where it does not reach.
function floorDistances(g: Grid, from: readonly Pos[]): number[][] {
  const d = g.map((row) => row.map(() => Infinity));
  const queue: Pos[] = [];
  for (const [x, y] of from)
    if (isFloor(g, x, y) && d[y]![x] === Infinity) {
      d[y]![x] = 0;
      queue.push([x, y]);
    }
  for (let i = 0; i < queue.length; i++) {
    const [x, y] = queue[i]!;
    for (const [dx, dy] of DIRS) {
      const nx = x + dx,
        ny = y + dy;
      if (isFloor(g, nx, ny) && d[ny]![nx] === Infinity) {
        d[ny]![nx] = d[y]![x]! + 1;
        queue.push([nx, ny]);
      }
    }
  }
  return d;
}
const nearest = (d: number[][], tiles: readonly Pos[]) => tiles.reduce((m, [x, y]) => Math.min(m, d[y]![x]!), Infinity);
const accessOf = (g: Grid, key: StationKey) => stationsOf(g, key).flatMap(([x, y]) => accessTiles(g, x, y));

export interface KitchenCost {
  routeCost: number; // sum over the recipe legs of the shortest walk between the leg's two station kinds
  firstStep: number; // sum over the team's spawns of the walk to the nearest dough crate
  interaction: number; // floor tiles next to some station other than a counter
  area: number; // floor tiles
  shared: number; // sum over the shared stations this kitchen touches of the walks from its spawns
}
export interface VersusReport {
  ok: boolean;
  errors: string[];
  s: number; // share of tiles equal to their twin (1 for a mirror map)
  kitchens: [KitchenCost, KitchenCost] | null;
  spread: Record<keyof KitchenCost, number>; // relative difference between the two kitchens, per metric
}

export function kitchenCost(g: Grid, spawns: readonly Pos[], shared: readonly Pos[]): KitchenCost {
  let routeCost = 0;
  for (const [from, to] of legsOf(g)) {
    const d = floorDistances(g, accessOf(g, from));
    const best = nearest(d, accessOf(g, to));
    routeCost += Number.isFinite(best) ? best : 99; // an unreachable leg is reported as an error elsewhere
  }
  const dough = accessOf(g, '1');
  const firstStep = spawns.reduce((n, sp) => n + Math.min(99, nearest(floorDistances(g, [sp]), dough)), 0);
  const touched = new Set<string>();
  g.forEach((row, y) =>
    row.forEach((t, x) => {
      if (t.kind === 'station' && t.station !== 'counter') for (const [ax, ay] of accessTiles(g, x, y)) touched.add(posKey(ax, ay));
    }),
  );
  let sharedCost = 0;
  for (const [x, y] of shared)
    if (g[y]?.[x]?.kind === 'station') {
      const access = accessTiles(g, x, y);
      sharedCost += spawns.reduce((n, sp) => n + Math.min(99, nearest(floorDistances(g, [sp]), access)), 0);
    }
  return { routeCost, firstStep, interaction: touched.size, area: floorTiles(g), shared: sharedCost };
}
export const spreadOf = (a: number, b: number) => (a === b ? 0 : Math.abs(a - b) / Math.max(a, b));
