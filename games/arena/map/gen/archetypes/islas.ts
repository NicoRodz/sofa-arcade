// Islas: in each half a wall column (5-7) splits the west room from the east rooms, and the east side is split again by a wall row; the rooms are joined
// only by 1-tile doors, one in the column for each exit's row (that row stays open end to end, so V4 holds). Each room keeps a free 4x3 core.
import { MAP_H } from '../../layout';
import type { Tile } from '../../tile-map';
import type { TemplateFn } from './kinds';

export const ROOM_W = 4;
export const ROOM_H = 3;

export const islas: TemplateFn = (rng, exits) => {
  const rows = exits.map(([, y]) => y);
  const c = 5 + Math.floor(rng() * 3);
  const r = Math.round((rows[1]! + rows[2]!) / 2);
  const walls: Tile[] = [];
  const keep: Tile[] = [];
  for (let y = 0; y < MAP_H; y++) if (!rows.includes(y)) walls.push([c, y]);
  for (let x = c + 1; x <= 12; x++) walls.push([x, r]);
  for (const y of rows) for (let x = 1; x <= 13; x++) keep.push([x, y]); // each exit's row stays open end to end: the doors line up with it
  const core = (x: number, y: number) => {
    for (let dy = 0; dy < ROOM_H; dy++) for (let dx = 0; dx < ROOM_W; dx++) keep.push([x + dx, y + dy]);
  };
  core(c + 1, 1 + Math.floor(rng() * Math.max(1, r - 4))); // east, north
  core(c + 1, r + 1 + Math.floor(rng() * Math.max(1, 14 - r - 3))); // east, south
  core(0, rows[1]! - 1); // west: beside the second exit
  core(0, Math.min(MAP_H - ROOM_H, rows[2]! - 1)); // west: beside the third
  return { walls, keep, lanes: false, forceWalls: false, maxX: 13, density: 0.18 + rng() * 0.02 };
};
