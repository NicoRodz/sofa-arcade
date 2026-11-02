// Grid movement: a body is one tile wide and goes along a corridor one unit (1/16 tile) at a time. Bodies cross each other; only furniture blocks.
import { solidAt, type TileMap } from '../../map';
import { ASSIST_UNITS, HALF, SPEED_UPS, TICK_HZ, TILE } from './config';
import { DX, DY, NONE, isHorizontal, type Dir } from './dir';
import type { GridBody } from './state';

const tileOf = (v: number): number => Math.floor(v / TILE);
const centreOf = (v: number): number => tileOf(v) * TILE + HALF;

/** Does a body centred at (x, y) fit, i.e. no tile under its 16x16 footprint is furniture or outside the map? */
export function fits(map: TileMap, x: number, y: number): boolean {
  const x0 = tileOf(x - HALF),
    x1 = tileOf(x + HALF - 1),
    y0 = tileOf(y - HALF),
    y1 = tileOf(y + HALF - 1);
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) if (solidAt(map, tx, ty)) return false;
  return true;
}

export const canStep = (map: TileMap, x: number, y: number, d: Dir): boolean => d === NONE || fits(map, x + DX[d]!, y + DY[d]!);

/**
 * Tries to head `d`: the coordinate across the new heading must sit on a tile centre, or within the corner assist (0.35 tile) of one, in which
 * case the body is aligned to it. Succeeds (and aligns) only if the first unit that way is free.
 */
export function tryHeading(map: TileMap, b: GridBody, d: Dir): boolean {
  const horizontal = isHorizontal(d);
  const cross = horizontal ? b.y : b.x;
  const c = centreOf(cross);
  if (Math.abs(cross - c) > ASSIST_UNITS) return false;
  const x = horizontal ? b.x : c,
    y = horizontal ? c : b.y;
  if (!canStep(map, x, y, d)) return false;
  b.x = x;
  b.y = y;
  b.dir = d;
  return true;
}

/** Advances a body along its heading by its speed in whole units (the sub-unit remainder carries to the next tick). */
export function advance(map: TileMap, b: GridBody): void {
  if (b.dir === NONE) {
    b.moved = false;
    return;
  }
  b.frac += SPEED_UPS;
  const n = Math.floor(b.frac / TICK_HZ);
  b.frac -= n * TICK_HZ;
  let went = 0;
  for (let i = 0; i < n && canStep(map, b.x, b.y, b.dir); i++) {
    b.x += DX[b.dir]!;
    b.y += DY[b.dir]!;
    went++;
  }
  if (n > 0) b.moved = went > 0;
}
