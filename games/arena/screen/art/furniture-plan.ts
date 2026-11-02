// Which pieces of furniture a map's wall tiles form: runs of 2 or more along a row become a sofa, along a column a sofa turned on its side, and the lone tiles
// a round table or a pouf. Pure: every wall tile belongs to exactly one piece (the test proves it), so the picture never draws a wall twice or leaves a hole.
import { MAP_H, MAP_W, solidAt, type TileMap } from '../../map';

export type PieceKind = 'sofa' | 'sofa-side' | 'table' | 'pouf';
export interface Piece {
  kind: PieceKind;
  x: number; // first tile
  y: number;
  w: number; // tiles
  h: number;
  tone: number; // 0..2: which café shade (a hash of the position, so the same map always looks the same)
}

const MAX_RUN = 3; // a longer run is cut into sofas of at most 3 tiles
const tone = (x: number, y: number): number => (x * 7 + y * 13) % 3;

export function planFurniture(map: TileMap): Piece[] {
  const taken = new Uint8Array(MAP_W * MAP_H);
  // in bounds: solidAt counts the outside as furniture, and a sofa must not run off the board
  const free = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < MAP_W && y < MAP_H && solidAt(map, x, y) && !taken[y * MAP_W + x];
  const take = (x: number, y: number, w: number, h: number) => {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) taken[(y + j) * MAP_W + x + i] = 1;
  };
  const out: Piece[] = [];
  const run = (x0: number, y0: number, dx: number, dy: number): number => {
    let n = 1;
    while (n < MAX_RUN && free(x0 + dx * n, y0 + dy * n)) n++;
    return n;
  };
  for (const pass of ['row', 'column', 'single'] as const)
    for (let y = 0; y < MAP_H; y++)
      for (let x = 0; x < MAP_W; x++) {
        if (!free(x, y)) continue;
        const n = pass === 'row' ? run(x, y, 1, 0) : pass === 'column' ? run(x, y, 0, 1) : 1;
        if (pass !== 'single' && n < 2) continue;
        const [w, h] = pass === 'column' ? [1, n] : [n, 1];
        const kind: PieceKind = pass === 'row' ? 'sofa' : pass === 'column' ? 'sofa-side' : (x + y) % 2 ? 'pouf' : 'table';
        take(x, y, w, h);
        out.push({ kind, x, y, w, h, tone: tone(x, y) });
      }
  return out;
}
