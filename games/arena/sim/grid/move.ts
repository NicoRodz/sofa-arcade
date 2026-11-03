// Grid movement: a body is one tile wide and goes along a corridor one unit (1/16 tile) at a time. Bodies cross each other; only furniture blocks.
import { solidAt, type TileMap } from '../../map';
import { ASSIST_UNITS, HALF, SPEED_UPS, TICK_HZ, TILE } from './config';
import { DOWN, DX, DY, LEFT, NONE, RIGHT, UP, isHorizontal, type Dir } from './dir';
import { executeRequest } from './metrics';
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
 * Centre of the lane a body must sit on to head `d` (the coordinate across `d`), or -1 if there is none: a running body must be within the corner
 * assist (0.4 tile) of it, a body at rest or against a wall may be up to half a tile away, and the first unit from the centre must be free.
 * A body exactly between two centres goes the way it was heading along that axis, else the way the stick leans (`pref`, -1/0/1): both mirror-safe.
 */
export function laneCentre(map: TileMap, b: GridBody, d: Dir, pref: number): number {
  const horizontal = isHorizontal(d);
  const cross = horizontal ? b.y : b.x;
  let c = centreOf(cross);
  if (cross - c === -HALF) {
    const along = horizontal ? (b.last === UP ? -1 : b.last === DOWN ? 1 : 0) : b.last === LEFT ? -1 : b.last === RIGHT ? 1 : 0;
    const side = along !== 0 ? along : pref;
    if (side === 0) return -1;
    if (side < 0) c -= TILE;
  }
  if (b.dir !== NONE && b.moved && Math.abs(cross - c) > ASSIST_UNITS) return -1;
  return canStep(map, horizontal ? b.x : c, horizontal ? c : b.y, d) ? c : -1;
}

/**
 * Advances a body by its speed in whole units (the sub-unit remainder carries to the next tick). With a turn chosen (`b.turn`), each unit first slides
 * the body onto the lane centre (along its heading, or back if it overshot: it never stops), and at the centre it takes the new heading.
 */
export function advance(map: TileMap, b: GridBody): void {
  let turn = b.turn;
  b.turn = NONE;
  if (b.dir === NONE && turn === NONE) {
    b.moved = false;
    return;
  }
  b.frac += SPEED_UPS;
  const n = Math.floor(b.frac / TICK_HZ);
  b.frac -= n * TICK_HZ;
  let went = 0;
  for (let i = 0; i < n; i++) {
    if (turn !== NONE) {
      const horizontal = isHorizontal(turn);
      const c = b.lane;
      const cross = horizontal ? b.y : b.x;
      if (cross !== c) {
        const step = cross < c ? 1 : -1;
        if (horizontal) b.y += step;
        else b.x += step;
        went++;
        continue;
      }
      if (canStep(map, b.x, b.y, turn)) {
        b.dir = turn;
        if (b.req?.dir === turn) executeRequest(b);
      }
      turn = NONE;
    }
    if (b.dir === NONE || !canStep(map, b.x, b.y, b.dir)) break;
    b.x += DX[b.dir]!;
    b.y += DY[b.dir]!;
    went++;
  }
  if (n > 0) b.moved = went > 0;
  if (b.dir !== NONE) b.last = b.dir;
}
