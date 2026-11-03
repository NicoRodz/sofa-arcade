// Islas: a floor plan. In each half, 2 to 4 closed rooms (a 3x3 to 4x3 free core inside a contour of furniture) laid out in a grid of two rows by two columns,
// with 1-tile doors; a free ring runs round them (the corridors above and below, the strip beside the exits, the avenue at the middle line).
// The rows of the exits cross the rooms through aligned doors, so every exit still walks 12-14 steps to the middle (V4) and the rooms stay rooms.
import type { Rng } from '@pichi/core';
import { MAP_H } from '../../layout';
import type { Tile } from '../../tile-map';
import type { TemplateFn } from './kinds';

const LAYOUTS = [
  [2, 6, 11], // 3 + 4 wide cores
  [2, 7, 11], // 4 + 3
  [2, 6, 10], // 3 + 3, wider avenue
  [3, 7, 11], // 3 + 3
] as const;
const WALL_ROWS = [3, 7, 11] as const; // between the corridors above/below and the two rows of rooms; the exits' rows never fall on them (they move 1 row)
const row = (k: number): number => WALL_ROWS[k]!;
const CELLS: readonly (readonly [number, number])[] = [
  [0, 0],
  [1, 0],
  [0, 1],
  [1, 1],
];

/** Which of the four cells of the grid hold a room: 4 (half the seeds), 3 or 2. */
function roomCells(rng: Rng): readonly (readonly [number, number])[] {
  const roll = rng();
  const drop = roll < 0.5 ? 0 : roll < 0.85 ? 1 : 2;
  const cells = [...CELLS];
  for (let k = 0; k < drop; k++) cells.splice(Math.floor(rng() * cells.length), 1);
  return cells;
}

export const islas: TemplateFn = (rng, exits) => {
  const lane = [exits[1]![1], exits[2]![1]]; // the rows that cross the rooms
  const cols = LAYOUTS[Math.floor(rng() * LAYOUTS.length)]!;
  const cells = roomCells(rng);
  const has = (c: number, r: number) => cells.some(([cc, rr]) => cc === c && rr === r);
  const walls: Tile[] = [];
  const keep: Tile[] = [];
  const clamp = (y: number, r: number) => Math.min(row(r + 1) - 1, Math.max(row(r) + 1, y));
  // vertical walls: wall j of row r stands when a room of that row touches it; its door sits on the exit's row (west wall) or within a row of it
  for (let j = 0; j < 3; j++)
    for (let r = 0; r < 2; r++) {
      if (!(has(j, r) || (j > 0 && has(j - 1, r)))) continue;
      const door = j === 0 ? lane[r]! : clamp(lane[r]! + Math.floor(rng() * 3) - 1, r);
      for (let y = row(r); y <= row(r + 1); y++) (y === door ? keep : walls).push([cols[j]!, y]);
    }
  // horizontal walls over each column of rooms: a door joins the two rooms of a column; the ones to the outside open one time in three
  for (let c = 0; c < 2; c++) {
    const [x0, x1] = [cols[c]!, cols[c + 1]!];
    for (let k = 0; k < 3; k++) {
      const stands = k === 0 ? has(c, 0) : k === 2 ? has(c, 1) : has(c, 0) || has(c, 1);
      if (!stands) continue;
      const door = x0 + 1 + Math.floor(rng() * (x1 - x0 - 1));
      const open = k === 1 ? has(c, 0) && has(c, 1) : rng() < 0.3;
      for (let x = x0; x <= x1; x++) if (!(open && x === door && x > x0 && x < x1)) walls.push([x, WALL_ROWS[k]!]);
      if (open) keep.push([door, WALL_ROWS[k]! - 1], [door, WALL_ROWS[k]!], [door, WALL_ROWS[k]! + 1]);
    }
  }
  for (const [c, r] of cells)
    for (let y = row(r) + 1; y < row(r + 1); y++) for (let x = cols[c]! + 1; x < cols[c + 1]!; x++) keep.push([x, y]); // the free core
  for (const y of [exits[0]![1], exits[3]![1]]) for (let x = 1; x <= 13; x++) keep.push([x, y]); // the exits at the edges walk the corridors above and below
  for (let y = 0; y < MAP_H; y++) for (let x = cols[2]! + 1; x <= 13; x++) keep.push([x, y]); // the avenue at the middle line
  return { walls, keep, lanes: false, forceWalls: true, maxX: 13, density: 0.2 + rng() * 0.02 };
};
