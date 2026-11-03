// What the signatures (V8) and the placement of the living map read off a TileMap: corridors, free rooms, wall bars, articulation tiles.
import { MAP_H, MAP_W } from '../../layout';
import { solidAt, type Tile, type TileMap } from '../../tile-map';

const HALF = (MAP_W - 1) / 2; // 13: the centre column
export const CORRIDOR_RUN = 10;
export const BAR_TILES = 8;

const free = (m: TileMap, x: number, y: number) => !solidAt(m, x, y);

/** Rows whose tiles from column 4 to the centre line are all floor: a free run of 10 that touches the middle (Pasillos). */
export const corridorRows = (m: TileMap): number[] =>
  Array.from({ length: MAP_H }, (_, y) => y).filter((y) =>
    Array.from({ length: CORRIDOR_RUN }, (_, k) => free(m, HALF - CORRIDOR_RUN + 1 + k, y)).every(Boolean),
  );

/** Rows of the left half (columns 0-12) with 8 or more tiles of furniture: a wall bar with a gap or two (a loose row of boxes holds 2 or 3). */
export const barRows = (m: TileMap): number[] =>
  Array.from({ length: MAP_H }, (_, y) => y).filter(
    (y) => Array.from({ length: HALF }, (_, x) => x).filter((x) => solidAt(m, x, y)).length >= BAR_TILES,
  );

export const ROOM_MIN_TILES = 9; // a sealed room: a free pocket of 9 to 40 tiles with a free 3x3 inside
export const ROOM_MAX_TILES = 40;
export const ROOM_MAX_DOORS = 4;

export interface Room {
  tiles: number; // floor tiles of the pocket
  doors: number; // 1-tile passes in its contour
  core: Tile; // the centre of a free 3x3 inside it
}

/** A door: a floor tile with furniture on both sides of one axis and floor on both sides of the other (a 1-tile pass through a wall or a bar). */
const isDoor = (m: TileMap, x: number, y: number): boolean => {
  const [l, r, u, d] = [solidAt(m, x - 1, y), solidAt(m, x + 1, y), solidAt(m, x, y - 1), solidAt(m, x, y + 1)];
  return free(m, x, y) && ((l && r && !u && !d) || (u && d && !l && !r));
};

/**
 * The sealed rooms of the left half: shut every door, then the pockets of floor that stay apart from the rest, away from the border, of 9 to 40 tiles with a
 * free 3x3 inside and 1 to 4 doors. A pocket whose contour leaks (even at a corner), touches the middle line or is the open floor round the rooms is not a room.
 */
export function sealedRooms(m: TileMap): Room[] {
  const seen = new Set<number>();
  const out: Room[] = [];
  const ok = (x: number, y: number) => x >= 0 && x <= HALF && y >= 0 && y < MAP_H && free(m, x, y) && !isDoor(m, x, y);
  for (let y0 = 0; y0 < MAP_H; y0++)
    for (let x0 = 0; x0 < HALF; x0++) {
      if (!ok(x0, y0) || seen.has(y0 * MAP_W + x0)) continue;
      const comp: Tile[] = [[x0, y0]];
      seen.add(y0 * MAP_W + x0);
      const doors = new Set<number>();
      let sealed = true;
      for (let k = 0; k < comp.length && comp.length <= ROOM_MAX_TILES; k++) {
        const [x, y] = comp[k]!;
        if (x === 0 || y === 0 || y === MAP_H - 1 || x === HALF) sealed = false; // the border and the middle line are never a wall of a room
        for (const [nx, ny] of [
          [x + 1, y],
          [x - 1, y],
          [x, y + 1],
          [x, y - 1],
        ] as const) {
          if (free(m, nx, ny) && !ok(nx, ny)) doors.add(ny * MAP_W + nx);
          if (!ok(nx, ny) || seen.has(ny * MAP_W + nx)) continue;
          seen.add(ny * MAP_W + nx);
          comp.push([nx, ny]);
        }
      }
      const inside = new Set(comp.map(([x, y]) => y * MAP_W + x));
      for (const [x, y] of comp)
        for (let dy = -1; sealed && dy <= 1; dy++)
          for (let dx = -1; sealed && dx <= 1; dx++)
            if (!inside.has((y + dy) * MAP_W + x + dx) && free(m, x + dx, y + dy) && !isDoor(m, x + dx, y + dy)) sealed = false; // a clear contour: furniture or a door all round, corners included
      if (!sealed || comp.length < ROOM_MIN_TILES || comp.length > ROOM_MAX_TILES || doors.size < 1 || doors.size > ROOM_MAX_DOORS)
        continue;
      const core = comp.find(([x, y]) => [-1, 0, 1].every((dy) => [-1, 0, 1].every((dx) => ok(x + dx, y + dy))));
      if (core) out.push({ tiles: comp.length, doors: doors.size, core });
    }
  return out;
}
