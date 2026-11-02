// A pinata's blast: the Manhattan diamond of its radius, walked tile by tile (BFS over floor), so furniture cuts it: what is behind a wall is not painted.
import { MAP_H, MAP_W, isSolid } from '../../map';

const NEIGHBOURS = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
] as const;

/** Tiles reached from (x, y) within `radius` steps over floor, the origin first, in a fixed order. */
export function blastTiles(x: number, y: number, radius: number): [number, number][] {
  const seen = new Set<number>([y * MAP_W + x]);
  const out: [number, number][] = [[x, y]];
  const dist = [0];
  for (let h = 0; h < out.length; h++) {
    const [cx, cy] = out[h]!;
    if (dist[h]! >= radius) continue;
    for (const [dx, dy] of NEIGHBOURS) {
      const nx = cx + dx!,
        ny = cy + dy!;
      if (nx < 0 || ny < 0 || nx >= MAP_W || ny >= MAP_H || isSolid(nx, ny) || seen.has(ny * MAP_W + nx)) continue;
      seen.add(ny * MAP_W + nx);
      out.push([nx, ny]);
      dist.push(dist[h]! + 1);
    }
  }
  return out;
}
