// V4-V7: what is judged once on the base map (they compare the two halves or count the whole floor): equal walks, even areas, no long dead ends, density.
import { floorCount, type TileMap } from '../tile-map';
import { bfs, floorNeighbours, index } from './graph';
import { CENTRE_COLUMN } from './validate-state';

export const MAX_EXIT_SPREAD = 2; // V4: longest minus shortest walk to the centre, within a team
export const AREA_TOLERANCE = 0.2; // V5: each exit's region within +-20 % of its team's mean
export const MAX_DEAD_END = 3; // V6
export const MIN_DENSITY = 0.18; // V7
export const MAX_DENSITY = 0.24;

const centreTiles = (m: TileMap): number[] => Array.from({ length: m.h }, (_, y) => index(m, CENTRE_COLUMN, y));

/** V4 equidistance: BFS steps from each exit to the centre column; within a team max - min <= 2, and both teams have the identical set of walks. */
export function v4Equidistance(m: TileMap): string | null {
  const d = bfs(m, centreTiles(m)).dist;
  const walks = m.spawns.map((team) => team.map(([x, y]) => d[index(m, x, y)]!));
  for (const [t, w] of walks.entries()) {
    if (w.some((v) => v < 0)) return `team ${t} has an exit that cannot reach the centre`;
    if (w.length && Math.max(...w) - Math.min(...w) > MAX_EXIT_SPREAD) return `team ${t} walks ${w.join('/')} to the centre`;
  }
  const [a, b] = walks.map((w) => [...w].sort((p, q) => p - q).join());
  return a === b ? null : `teams walk ${a} vs ${b}`;
}

/** V5 even area: the same number of paintable tiles in each half, and each exit's BFS (Voronoi) region within +-20 % of the mean of its team. */
export function v5EvenArea(m: TileMap): string | null {
  const half = (m.w - 1) / 2;
  let left = 0;
  let right = 0;
  for (let y = 0; y < m.h; y++)
    for (let x = 0; x < m.w; x++)
      if (m.solid[y * m.w + x] === 0) {
        if (x < half) left++;
        else if (x > half) right++;
      }
  if (left !== right) return `halves paint ${left} vs ${right}`;
  for (const [t, team] of m.spawns.entries()) {
    if (team.length < 2) continue;
    const f = bfs(
      m,
      team.map(([x, y]) => index(m, x, y)),
    );
    const size = new Array<number>(team.length).fill(0);
    for (let k = 0; k < f.reached; k++) {
      const i = f.order[k]!;
      const x = i % m.w;
      if (t === 0 ? x < half : x > half) size[f.owner[i]!]!++;
    }
    const mean = size.reduce((s, v) => s + v, 0) / size.length;
    if (size.some((v) => Math.abs(v - mean) > AREA_TOLERANCE * mean)) return `team ${t} regions ${size.join('/')}`;
  }
  return null;
}

/** V6 dead ends: no corridor that ends in a wall is longer than 3 tiles (counted from its closed end to the first tile with a choice). */
export function v6DeadEnds(m: TileMap): string | null {
  const nb: number[] = [];
  const degree = (i: number) => floorNeighbours(m, i, nb).length;
  for (let i = 0; i < m.solid.length; i++) {
    if (m.solid[i] === 1 || degree(i) !== 1) continue;
    let prev = i;
    let cur = floorNeighbours(m, i, nb)[0]!;
    let len = 1;
    while (len <= MAX_DEAD_END && degree(cur) === 2) {
      const next = floorNeighbours(m, cur, nb).find((j) => j !== prev)!;
      prev = cur;
      cur = next;
      len++;
    }
    if (len > MAX_DEAD_END) return `dead end of more than ${MAX_DEAD_END} tiles at (${i % m.w},${Math.floor(i / m.w)})`;
  }
  return null;
}

/** V7 density: between 18 % and 24 % of the 27x15 tiles are furniture. */
export function v7Density(m: TileMap): string | null {
  const d = (m.solid.length - floorCount(m)) / m.solid.length;
  return d >= MIN_DENSITY && d <= MAX_DENSITY ? null : `density ${(d * 100).toFixed(1)} %`;
}
