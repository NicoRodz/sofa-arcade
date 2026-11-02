// Walkable-graph helpers shared by the validators: 4-neighbour BFS over the floor of a TileMap, on flat tile indexes (y * w + x).
import type { TileMap } from '../tile-map';

export const index = (m: TileMap, x: number, y: number): number => y * m.w + x;

/** Floor 4-neighbours of tile `i` (out of bounds and furniture excluded), in a fixed order: right, down, left, up. */
export function floorNeighbours(m: TileMap, i: number, out: number[] = []): number[] {
  out.length = 0;
  const x = i % m.w;
  const y = (i - x) / m.w;
  if (x + 1 < m.w && m.solid[i + 1] === 0) out.push(i + 1);
  if (y + 1 < m.h && m.solid[i + m.w] === 0) out.push(i + m.w);
  if (x > 0 && m.solid[i - 1] === 0) out.push(i - 1);
  if (y > 0 && m.solid[i - m.w] === 0) out.push(i - m.w);
  return out;
}

export interface Field {
  dist: Int16Array; // steps from the nearest source (-1: furniture or unreachable)
  owner: Int16Array; // index in `sources` of the source that reached the tile first (-1: none); a tie goes to the earlier source
  order: Int32Array; // tiles in the order they were reached
  reached: number;
}

/** Multi-source BFS over the floor. Sources on furniture are ignored. */
export function bfs(m: TileMap, sources: readonly number[]): Field {
  const n = m.w * m.h;
  const dist = new Int16Array(n).fill(-1);
  const owner = new Int16Array(n).fill(-1);
  const order = new Int32Array(n);
  let tail = 0;
  sources.forEach((s, k) => {
    if (m.solid[s] === 1 || dist[s] !== -1) return;
    dist[s] = 0;
    owner[s] = k;
    order[tail++] = s;
  });
  const nb: number[] = [];
  for (let head = 0; head < tail; head++) {
    const i = order[head]!;
    for (const j of floorNeighbours(m, i, nb))
      if (dist[j] === -1) {
        dist[j] = dist[i]! + 1;
        owner[j] = owner[i]!;
        order[tail++] = j;
      }
  }
  return { dist, owner, order, reached: tail };
}
