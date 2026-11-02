// V1-V3: what must hold in every state of the map (with a living map, in every combination of its elements). Each takes one TileMap and returns why it fails, or null.
import { MAP_W } from '../layout';
import { floorCount, type TileMap } from '../tile-map';
import { bfs, floorNeighbours, index } from './graph';

export const CENTRE_COLUMN = (MAP_W - 1) / 2; // 13: its own mirror image
export const MIN_CROSSINGS = 3;
export const MIN_CROSSING_GAP = 2; // rows between two of them

/** V1 connection: a single walkable component (4 neighbours). */
export function v1Connection(m: TileMap): string | null {
  const first = m.solid.indexOf(0);
  if (first < 0) return 'no floor';
  const reached = bfs(m, [first]).reached;
  return reached === floorCount(m) ? null : `${floorCount(m) - reached} floor tiles cut off`;
}

/** V2 crossings: at least 3 free tiles in the centre column, 2 rows or more apart (a team can always find a way across). */
export function v2Crossings(m: TileMap): string | null {
  let count = 0;
  let last = -MIN_CROSSING_GAP;
  for (let y = 0; y < m.h; y++) {
    if (m.solid[index(m, CENTRE_COLUMN, y)] === 1 || y - last < MIN_CROSSING_GAP) continue;
    count++;
    last = y;
  }
  return count >= MIN_CROSSINGS ? null : `${count} crossings in the centre column`;
}

/** V3 exits: every exit is floor and has at least 2 free directions. */
export function v3Exits(m: TileMap): string | null {
  const nb: number[] = [];
  for (const [t, team] of m.spawns.entries())
    for (const [x, y] of team) {
      const i = index(m, x, y);
      if (m.solid[i] === 1) return `team ${t} exit (${x},${y}) is furniture`;
      const n = floorNeighbours(m, i, nb).length;
      if (n < 2) return `team ${t} exit (${x},${y}) has ${n} free direction(s)`;
    }
  return null;
}
