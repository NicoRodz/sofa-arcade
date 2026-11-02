// The push rule (F5): when a pair changes, the tiles it shuts may hold a body or a pinata.
//  - A body is pushed along the way the part moves, as far as it takes to stand on floor again (at most MAX_PUSH_UNITS), and ends flush with the part.
//  - A pinata is never moved (no kicking, no throwing): the pair waits until it goes off (a fuse is 2 s).
//  - If a body has nowhere to go (a wall, or another shut tile, within MAX_PUSH_UNITS), the pair waits too, as a whole: both members, so the mirror holds.
// Nothing is applied unless everything fits, so nobody is ever left inside a tile that shuts. V1-V3 hold in every combination of states, so a body that fits
// is on floor of the one connected map: nobody is shut in.
import type { Closing } from '../../map';
import { DX, DY } from '../grid/dir';
import { TILE } from '../grid/config';
import { fits } from '../grid/move';
import type { ManchazoState } from '../match/state';
import { MAX_PUSH_UNITS } from './config';

const HALF = TILE / 2;
const tileOf = (v: number): number => Math.floor(v / TILE);

/** The shutting tile a body (16x16 units) overlaps, if any. */
function hitBy(x: number, y: number, shut: readonly Closing[]): Closing | undefined {
  const [x0, x1, y0, y1] = [tileOf(x - HALF), tileOf(x + HALF - 1), tileOf(y - HALF), tileOf(y + HALF - 1)];
  return shut.find((c) => c.x >= x0 && c.x <= x1 && c.y >= y0 && c.y <= y1);
}

/** Where each body ends up if the tiles `shut` close (`solid` is the map after the change); null when the pair has to wait. Bodies that stay put are not listed. */
export function planPush(s: ManchazoState, solid: Uint8Array, shut: readonly Closing[]): Map<number, [number, number]> | null {
  if (s.match.pinatas.some((p) => shut.some((c) => c.x === p.x && c.y === p.y))) return null;
  const after = { ...s.grid.map, solid };
  const moves = new Map<number, [number, number]>();
  for (const [i, b] of s.grid.bodies.entries()) {
    const hit = hitBy(b.x, b.y, shut);
    if (!hit) continue;
    let [x, y] = [b.x, b.y];
    for (let n = 0; !fits(after, x, y); n++) {
      [x, y] = [x + DX[hit.dir]!, y + DY[hit.dir]!];
      if (n >= MAX_PUSH_UNITS || !fits(s.grid.map, x, y)) return null; // too far, or a wall in the way: the push never goes through furniture
    }
    moves.set(i, [x, y]);
  }
  return moves;
}
