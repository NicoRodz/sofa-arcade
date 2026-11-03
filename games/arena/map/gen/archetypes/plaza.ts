// Plaza: a free rectangle at the middle (columns 10-16, 5 rows) that all the lanes lead into, and all the furniture packed in the sides (columns 0-8).
import type { Tile } from '../../tile-map';
import type { TemplateFn } from './kinds';

export const PLAZA_ROWS = 5;
export const SIDE_MAX_X = 8;

export const plaza: TemplateFn = (rng) => {
  const y0 = 4 + Math.floor(rng() * 3);
  const keep: Tile[] = [];
  for (let y = y0; y < y0 + PLAZA_ROWS; y++) for (let x = 10; x <= 13; x++) keep.push([x, y]);
  return { walls: [], keep, lanes: true, forceWalls: false, maxX: SIDE_MAX_X, density: 0.225 + rng() * 0.01 };
};
