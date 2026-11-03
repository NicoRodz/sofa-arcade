// What the signatures (V8) and the placement of the living map read off a TileMap: corridors, free rooms, wall bars, articulation tiles.
import { MAP_H, MAP_W } from '../../layout';
import { solidAt, type Tile, type TileMap } from '../../tile-map';

const HALF = (MAP_W - 1) / 2; // 13: the centre column
export const CORRIDOR_RUN = 10;
export const BAR_TILES = 8;

const free = (m: TileMap, x: number, y: number) => !solidAt(m, x, y);

/** Rows whose tiles from column 4 to the centre line are all floor: a free run of 10 that touches the middle (Pasillos). */
export const corridorRows = (m: TileMap): number[] =>
  Array.from({ length: MAP_H }, (_, y) => y).filter((y) => Array.from({ length: CORRIDOR_RUN }, (_, k) => free(m, HALF - CORRIDOR_RUN + 1 + k, y)).every(Boolean));

/** Rows of the left half (columns 0-12) with 8 or more tiles of furniture: a wall bar with a gap or two (a loose row of boxes holds 2 or 3). */
export const barRows = (m: TileMap): number[] =>
  Array.from({ length: MAP_H }, (_, y) => y).filter((y) => Array.from({ length: HALF }, (_, x) => x).filter((x) => solidAt(m, x, y)).length >= BAR_TILES);

/** Top-left corners of free w x h rooms of the left half (columns 0-12), taken greedily and disjoint, scanning rows then columns. */
export function freeRooms(m: TileMap, w: number, h: number): Tile[] {
  const used = new Set<number>();
  const out: Tile[] = [];
  for (let y = 0; y + h <= MAP_H; y++)
    for (let x = 0; x + w <= HALF; x++) {
      let ok = true;
      for (let dy = 0; ok && dy < h; dy++) for (let dx = 0; ok && dx < w; dx++) ok = free(m, x + dx, y + dy) && !used.has((y + dy) * MAP_W + x + dx);
      if (!ok) continue;
      out.push([x, y]);
      for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) used.add((y + dy) * MAP_W + x + dx);
    }
  return out;
}

/** The most doors in one wall column of the left half: floor tiles with furniture above and below and floor on both sides (a 1-tile pass through a wall). */
export function doorsInWall(m: TileMap): number {
  let best = 0;
  for (let x = 1; x < HALF; x++) {
    let n = 0;
    for (let y = 0; y < MAP_H; y++) if (free(m, x, y) && free(m, x - 1, y) && free(m, x + 1, y) && solidAt(m, x, y - 1) && solidAt(m, x, y + 1)) n++;
    best = Math.max(best, n);
  }
  return best;
}
