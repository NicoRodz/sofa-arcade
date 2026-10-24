// Tile grid the simulation collides with. Mutable on purpose: F2a overlays doors, gates, crumbling tiles by setting cells.
import type { ParsedLevel } from '../parse';
import { T, isHazardKind, isOneWayKind, isSolidKind, type TileKind } from '../legend';
import { TILE } from '../constants';
import type { GameMode } from '../types';

export interface TileGrid { w: number; h: number; cells: Uint8Array }

// Runtime grid for a mode: '%' is solid in Libres and empty in Encadenados.
export function buildGrid(p: ParsedLevel, mode: GameMode): TileGrid {
  const cells = Uint8Array.from(p.tiles);
  for (let i = 0; i < cells.length; i++) if (cells[i] === T.FreeSolid) cells[i] = mode === 'free' ? T.Solid : T.Empty;
  return { w: p.w, h: p.h, cells };
}

// Outside the level: left and right are walls, above is open sky (a jump may leave the top row), below is the void.
export function tileAt(g: TileGrid, tx: number, ty: number): TileKind {
  if (tx < 0 || tx >= g.w) return T.Solid;
  if (ty < 0 || ty >= g.h) return T.Empty;
  return g.cells[ty * g.w + tx]! as TileKind;
}
export function setTile(g: TileGrid, tx: number, ty: number, k: TileKind): void {
  if (tx >= 0 && tx < g.w && ty >= 0 && ty < g.h) g.cells[ty * g.w + tx] = k;
}

export const tileOf = (px: number): number => Math.floor(px / TILE);
const EPS = 1e-6;

// Does the box (left, top, w, h in px) touch a tile for which pred is true?
export function boxTouches(g: TileGrid, x: number, y: number, w: number, h: number, pred: (k: TileKind) => boolean): boolean {
  const x0 = tileOf(x), x1 = tileOf(x + w - EPS), y0 = tileOf(y), y1 = tileOf(y + h - EPS);
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) if (pred(tileAt(g, tx, ty))) return true;
  return false;
}
export const boxHitsSolid = (g: TileGrid, x: number, y: number, w: number, h: number): boolean => boxTouches(g, x, y, w, h, isSolidKind);

// Hazard overlap with the box shrunk a few px so a graze does not kill.
export const HAZARD_SHRINK = 4;
export const boxHitsHazard = (g: TileGrid, x: number, y: number, w: number, h: number): boolean =>
  boxTouches(g, x + HAZARD_SHRINK, y + HAZARD_SHRINK, w - 2 * HAZARD_SHRINK, h - 2 * HAZARD_SHRINK, isHazardKind);

export { isOneWayKind, isSolidKind, isHazardKind };
