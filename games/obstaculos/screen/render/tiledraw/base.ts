// Shared by every tile drawer: the canvas type, neighbour masks, per-cell random, the open-outline helper and the CellCtx.
import { T, TILE, isSolidKind, tileAt, type Biome, type TileGrid } from '../../../index';
import { INK, type Palette } from '../biome';

export type Ctx = CanvasRenderingContext2D;
export const N_ = 1,
  E_ = 2,
  S_ = 4,
  W_ = 8;

// Deterministic per-cell random in [0, 1).
export function cellRand(x: number, y: number, i = 0): number {
  let h = Math.imul(x * 374761393 + y * 668265263 + i * 2147483647, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const solid = (g: TileGrid, x: number, y: number) => isSolidKind(tileAt(g, x, y)) && x >= 0 && x < g.w && !(y >= g.h); // outside left/right is a wall: drawn open
// Mask of neighbours that are plain terrain-like solids (merge outline with them).
export function terrainMask(g: TileGrid, x: number, y: number): number {
  const s = (xx: number, yy: number) => (xx < 0 || xx >= g.w ? true : yy >= g.h ? true : solid(g, xx, yy));
  return (s(x, y - 1) ? N_ : 0) | (s(x + 1, y) ? E_ : 0) | (s(x, y + 1) ? S_ : 0) | (s(x - 1, y) ? W_ : 0);
}

export function shape(c: Ctx, x: number, y: number, w: number, h: number, r: [number, number, number, number]) {
  c.beginPath();
  c.moveTo(x + r[0], y);
  c.lineTo(x + w - r[1], y);
  if (r[1]) c.quadraticCurveTo(x + w, y, x + w, y + r[1]);
  c.lineTo(x + w, y + h - r[2]);
  if (r[2]) c.quadraticCurveTo(x + w, y + h, x + w - r[2], y + h);
  c.lineTo(x + r[3], y + h);
  if (r[3]) c.quadraticCurveTo(x, y + h, x, y + h - r[3]);
  c.lineTo(x, y + r[0]);
  if (r[0]) c.quadraticCurveTo(x, y, x + r[0], y);
  c.closePath();
}

// Ink outline along the open edges only, rounded at convex corners.
export function outlineOpen(c: Ctx, x: number, y: number, mask: number, r: number, lw = 3) {
  const o = lw / 2;
  const nO = !(mask & N_),
    eO = !(mask & E_),
    sO = !(mask & S_),
    wO = !(mask & W_);
  const rTL = nO && wO ? r : 0,
    rTR = nO && eO ? r : 0,
    rBR = sO && eO ? r : 0,
    rBL = sO && wO ? r : 0;
  const x0 = x + o,
    y0 = y + o,
    x1 = x + TILE - o,
    y1 = y + TILE - o;
  c.strokeStyle = INK;
  c.lineWidth = lw;
  c.lineCap = 'round';
  c.lineJoin = 'round';
  c.beginPath();
  if (nO) {
    c.moveTo(x0 + rTL, y0);
    c.lineTo(x1 - rTR, y0);
  }
  if (nO && eO) {
    c.moveTo(x1 - rTR, y0);
    c.quadraticCurveTo(x1, y0, x1, y0 + rTR);
  }
  if (eO) {
    c.moveTo(x1, y0 + rTR);
    c.lineTo(x1, y1 - rBR);
  }
  if (sO && eO) {
    c.moveTo(x1, y1 - rBR);
    c.quadraticCurveTo(x1, y1, x1 - rBR, y1);
  }
  if (sO) {
    c.moveTo(x1 - rBR, y1);
    c.lineTo(x0 + rBL, y1);
  }
  if (sO && wO) {
    c.moveTo(x0 + rBL, y1);
    c.quadraticCurveTo(x0, y1, x0, y1 - rBL);
  }
  if (wO) {
    c.moveTo(x0, y1 - rBL);
    c.lineTo(x0, y0 + rTL);
  }
  if (nO && wO) {
    c.moveTo(x0, y0 + rTL);
    c.quadraticCurveTo(x0, y0, x0 + rTL, y0);
  }
  c.stroke();
}

export interface CellCtx {
  g: TileGrid;
  x: number;
  y: number;
  px: number;
  py: number;
  mask: number;
  biome: Biome;
  pal: Palette;
  seed: number;
}

export function depthAbove(g: TileGrid, x: number, y: number): number {
  let d = 0;
  while (d < 6 && y - d - 1 >= 0 && tileAt(g, x, y - d - 1) === T.Solid) d++;
  return d;
}
