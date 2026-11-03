// V8, the signature of an archetype: what a map must show to be called Pasillos, Islas, Plaza or Ocho. The generator checks it on every attempt; a map that
// does not show it is retried, never relabelled. All four read the left half; the right half is its mirror image, so one half is enough.
import { MAP_H, MAP_W } from '../../layout';
import { solidAt, type TileMap } from '../../tile-map';
import { ROOM_H, ROOM_W } from './islas';
import type { Archetype } from './kinds';
import { SIDE_MAX_X } from './plaza';
import { doorsInWall, barRows, corridorRows, freeRooms } from './rooms';

export const MIN_CORRIDORS = 3; // Pasillos: rows with a free run of 10 that touches the middle line, and as many wall bars
export const MIN_ROOMS = 2; // Islas: free 4x3 rooms per half
export const MIN_DOORS = 3; // Islas: 1-tile doors in one wall column
export const PLAZA_W = 7;
export const PLAZA_H = 5;
export const SIDE_WALL_SHARE = 0.3; // Plaza: share of furniture in the sides (columns 0-8)
export const MIN_RING = 16; // Ocho: tiles of the free ring around each half's block
const HALF = (MAP_W - 1) / 2;

type Signature = (m: TileMap) => string | null;

const pasillos: Signature = (m) => {
  const c = corridorRows(m).length;
  const b = barRows(m).length;
  return c >= MIN_CORRIDORS && b >= MIN_CORRIDORS ? null : `${c} corridors and ${b} wall bars (need ${MIN_CORRIDORS} of each)`;
};

const islas: Signature = (m) => {
  const rooms = freeRooms(m, ROOM_W, ROOM_H).length;
  const doors = doorsInWall(m);
  return rooms >= MIN_ROOMS && doors >= MIN_DOORS ? null : `${rooms} rooms, ${doors} doors in the widest wall`;
};

const plaza: Signature = (m) => {
  for (let y = 0; y + PLAZA_H <= MAP_H; y++)
    for (let x = HALF - PLAZA_W + 1; x <= HALF; x++) {
      let open = true;
      for (let dy = 0; open && dy < PLAZA_H; dy++) for (let dx = 0; open && dx < PLAZA_W; dx++) open = !solidAt(m, x + dx, y + dy);
      if (!open) continue;
      let walls = 0;
      for (let yy = 0; yy < MAP_H; yy++) for (let xx = 0; xx <= SIDE_MAX_X; xx++) if (solidAt(m, xx, yy)) walls++;
      const share = walls / ((SIDE_MAX_X + 1) * MAP_H);
      return share >= SIDE_WALL_SHARE ? null : `the sides hold ${(share * 100).toFixed(0)} % of furniture`;
    }
  return `no free ${PLAZA_W}x${PLAZA_H} plaza across the middle line`;
};

/** A solid block that leans on the middle line (its right edge on column 12) and has a free ring of 16 or more tiles all the way round it, centre line included. */
const ocho: Signature = (m) => {
  for (let w = 3; w <= 6; w++)
    for (let h = 3; h <= 5; h++) {
      if (2 * (w + h) + 4 < MIN_RING) continue;
      const x0 = HALF - w;
      for (let y0 = 1; y0 + h < MAP_H; y0++) {
        let ok = true;
        for (let y = y0 - 1; ok && y <= y0 + h; y++)
          for (let x = x0 - 1; ok && x <= HALF; x++) ok = solidAt(m, x, y) === (x >= x0 && x < HALF && y >= y0 && y < y0 + h);
        if (ok) return null;
      }
    }
  return 'no free ring of 16 tiles around a block on the middle line';
};

const SIGNATURES: Readonly<Record<Archetype, Signature>> = { pasillos, islas, plaza, ocho };

/** V8: null when the map shows the signature of `kind`, else why not. */
export const v8Signature = (kind: Archetype, m: TileMap): string | null => SIGNATURES[kind](m);
