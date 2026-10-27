// Test support for the mechanics tests: map 1 with one tile replaced by a mechanic letter.
import { FIXED_MAPS } from '../../sim/maps';

const BASE = FIXED_MAPS[0]!.rows;
/** The row index and column of the first plain floor tile of map 1. */
export const FLOOR_AT: [number, number] = (() => {
  for (let y = 0; y < BASE.length; y++) {
    const x = BASE[y]!.indexOf('.');
    if (x >= 0) return [x, y];
  }
  throw new Error('map 1 has no floor');
})();

export const withLetter = (c: string, at: [number, number] = FLOOR_AT): string[] =>
  BASE.map((row, y) => (y === at[1] ? row.slice(0, at[0]) + c + row.slice(at[0] + 1) : row));
