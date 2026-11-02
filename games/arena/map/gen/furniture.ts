// The furniture the generator stamps on the left half (columns 0-13) of the map; every cell is set together with its mirror image (x -> 26 - x), so the
// result is symmetric by construction. Pieces: box 1x1, sofa 2x1, table 2x2, L-shaped shelf. No alternating grid of pillars.
import type { Rng } from '@pichi/core';
import type { Tile } from '../tile-map';

interface Piece {
  weight: number;
  cells: readonly Tile[];
}

const rotate = (cells: readonly Tile[]): Tile[] => cells.map(([x, y]) => [-y, x]);
const L: Tile[] = [
  [0, 0],
  [1, 0],
  [0, 1],
];
const L2 = rotate(L);
const L3 = rotate(L2);
const L4 = rotate(L3);

export const PIECES: readonly Piece[] = [
  { weight: 4, cells: [[0, 0]] }, // box
  {
    weight: 3,
    cells: [
      [0, 0],
      [1, 0],
    ],
  }, // sofa
  {
    weight: 3,
    cells: [
      [0, 0],
      [0, 1],
    ],
  },
  {
    weight: 2,
    cells: [
      [0, 0],
      [1, 0],
      [0, 1],
      [1, 1],
    ],
  }, // table
  ...[L, L2, L3, L4].map((cells) => ({ weight: 1, cells })), // shelf
];
const TOTAL_WEIGHT = PIECES.reduce((n, p) => n + p.weight, 0);

export function pickPiece(rng: Rng): Piece {
  let r = rng() * TOTAL_WEIGHT;
  for (const p of PIECES) if ((r -= p.weight) < 0) return p;
  return PIECES[0]!;
}

export interface Stamp {
  solid: Uint8Array;
  keep: Uint8Array; // 1: must stay floor (the exits' free radius and lanes)
  band: Int8Array; // the exit each tile of the half belongs to (-1: the centre column, which belongs to no half)
  quota: number[]; // furniture tiles each band may take in the half (columns 0-12)
  w: number;
  h: number;
}

const COLUMNS_LEFT = 14; // columns 0-13: the half and the centre column

/** Tries to put a piece with its top-left corner at (x, y), with its mirror, if the bands have quota left and `connected` still holds. Returns the tiles added. */
export function stamp(s: Stamp, piece: Piece, x: number, y: number, connected: () => boolean): number {
  const at: number[] = [];
  const charge = s.quota.map(() => 0);
  for (const [dx, dy] of piece.cells) {
    const px = x + dx;
    const py = y + dy;
    if (px < 0 || px >= COLUMNS_LEFT || py < 0 || py >= s.h) return 0;
    const i = py * s.w + px;
    if (s.solid[i] === 1 || s.keep[i] === 1) return 0;
    if (s.band[i]! >= 0) charge[s.band[i]!]!++;
    at.push(i, py * s.w + (s.w - 1 - px));
  }
  if (charge.some((c, b) => c > s.quota[b]!)) return 0;
  const added: number[] = [];
  for (const i of at)
    if (s.solid[i] === 0) {
      s.solid[i] = 1;
      added.push(i);
    }
  if (!connected()) {
    for (const i of added) s.solid[i] = 0; // it would cut a pocket off: not here
    return 0;
  }
  charge.forEach((c, b) => (s.quota[b]! -= c));
  return added.length;
}

/** Stamps random pieces until the quotas are used up (or `tries` runs out). Returns the tiles of furniture placed. */
export function furnish(s: Stamp, rng: Rng, connected: () => boolean, tries: number): number {
  let n = 0;
  for (let t = 0; t < tries && s.quota.some((q) => q > 0); t++) {
    const piece = pickPiece(rng);
    n += stamp(s, piece, Math.floor(rng() * COLUMNS_LEFT), Math.floor(rng() * s.h), connected);
  }
  return n;
}
