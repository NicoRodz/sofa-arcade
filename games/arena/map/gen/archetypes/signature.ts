// V8, the signature of an archetype: what a map must show to be called Pasillos, Islas, Plaza or Ocho. The generator checks it on every attempt; a map that
// does not show it is retried, never relabelled. All four read the left half; the right half is its mirror image, so one half is enough.
import { MAP_H, MAP_W } from '../../layout';
import { solidAt, type TileMap } from '../../tile-map';
import type { Archetype } from './kinds';
import { SIDE_MAX_X } from './plaza';
import { barRows, corridorRows, sealedRooms } from './rooms';

export const MIN_CORRIDORS = 3; // Pasillos: rows with a free run of 10 that touches the middle line, and as many wall bars
export const MIN_ROOMS = 2; // Islas: sealed rooms per half (2 to 4)
export const MAX_ROOMS = 4;
export const MIN_ROOM_FLOOR = 24; // Islas: floor tiles in all the rooms of a half together (a pair of 3x3 pockets between two furniture bars is not a floor plan)
export const PLAZA_W = 7;
export const PLAZA_H = 5;
export const SIDE_WALL_SHARE = 0.3; // Plaza: share of furniture in the sides (columns 0-8)
export const MIN_RING = 16; // Ocho: tiles of the free ring around each half's block
const HALF = (MAP_W - 1) / 2;

type Signature = (m: TileMap) => string | null;

const pasillos: Signature = (m) => {
  const rooms = sealedRooms(m).length;
  if (rooms >= MIN_ROOMS) return `${rooms} sealed rooms: a floor plan, not corridors`; // Islas has its own signature
  const c = corridorRows(m).length;
  const b = barRows(m).length;
  return c >= MIN_CORRIDORS && b >= MIN_CORRIDORS ? null : `${c} corridors and ${b} wall bars (need ${MIN_CORRIDORS} of each)`;
};

const islas: Signature = (m) => {
  const rooms = sealedRooms(m);
  const floor = rooms.reduce((n, r) => n + r.tiles, 0);
  if (rooms.length < MIN_ROOMS || rooms.length > MAX_ROOMS)
    return `${rooms.length} sealed rooms in the half (need ${MIN_ROOMS} to ${MAX_ROOMS})`;
  return floor >= MIN_ROOM_FLOOR ? null : `${rooms.length} sealed rooms hold ${floor} floor tiles (need ${MIN_ROOM_FLOOR})`;
};

/** The first free 7x5 rectangle centred on the middle line (top-left corner), or null. The maps are mirrored, so any free 7x5 that crosses the line holds this one. */
export function plazaRect(m: TileMap): { x: number; y: number } | null {
  const x = HALF - (PLAZA_W - 1) / 2;
  for (let y = 0; y + PLAZA_H <= MAP_H; y++) {
    let open = true;
    for (let dy = 0; open && dy < PLAZA_H; dy++) for (let dx = 0; open && dx < PLAZA_W; dx++) open = !solidAt(m, x + dx, y + dy);
    if (open) return { x, y };
  }
  return null;
}

const plaza: Signature = (m) => {
  if (!plazaRect(m)) return `no free ${PLAZA_W}x${PLAZA_H} plaza across the middle line`;
  let walls = 0;
  for (let yy = 0; yy < MAP_H; yy++) for (let xx = 0; xx <= SIDE_MAX_X; xx++) if (solidAt(m, xx, yy)) walls++;
  const share = walls / ((SIDE_MAX_X + 1) * MAP_H);
  return share >= SIDE_WALL_SHARE ? null : `the sides hold ${(share * 100).toFixed(0)} % of furniture`;
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
