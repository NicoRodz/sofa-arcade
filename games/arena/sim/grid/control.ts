// What the stick means for one body each tick, per control plan. The stick gives a main direction (hysteresis around the diagonal) and, when the
// other axis is pushed too, a second choice. The body never stands for a turn it cannot take yet: it keeps its heading, and a turn asked for
// near a lane (corner assist, 0.4 tile) slides onto it and turns, without stopping (`advance` does the slide). A request lives while the stick
// asks for it and 180 ms after. Plan A: the body goes where the stick points and stops when it is released (after a short grace). Plan B: the body
// keeps its heading until a wall; the stick only asks for turns, and pushing backwards is a U-turn.
import type { TileMap } from '../../map';
import { REST_GRACE_TICKS, TURN_BUFFER_TICKS, type ControlPlan } from './config';
import { NONE, isHorizontal, opposite, type Dir } from './dir';
import { ageRequest, cancelRequest, executeRequest, newRequest } from './metrics';
import { canStep, laneCentre } from './move';
import { quantizeStick, secondaryAxis } from './quantize';
import type { GridBody, GridInput } from './state';

/** Tries to take `d` now: straight on, a U-turn at once, or a turn that `advance` will slide to (`b.turn`). False if it cannot be taken from here. */
function take(map: TileMap, b: GridBody, d: Dir, sx: number, sy: number): boolean {
  if (d === NONE) return false;
  if (d === b.dir) return canStep(map, b.x, b.y, d);
  if (b.dir !== NONE && d === opposite(b.dir)) {
    if (!canStep(map, b.x, b.y, d)) return false;
    b.dir = d; // straight back along the same corridor: nothing to align
    if (b.req?.dir === d) executeRequest(b);
    return true;
  }
  const c = laneCentre(map, b, d, Math.sign(isHorizontal(d) ? sy : sx));
  if (c < 0) return false;
  b.turn = d;
  b.lane = c;
  return true;
}

export function steer(map: TileMap, b: GridBody, inp: GridInput, plan: ControlPlan): void {
  const p = quantizeStick(inp.sx, inp.sy, b.q);
  b.q = p;
  b.turn = NONE;
  if (p === NONE) {
    b.rest = Math.min(b.rest + 1, REST_GRACE_TICKS);
    if (plan === 'A' && b.rest >= REST_GRACE_TICKS) {
      b.dir = NONE; // released: plan A stands, and a buffered turn goes with it
      cancelRequest(b);
      return;
    }
  } else b.rest = 0;

  // the request: the stick's main direction when it is not the heading; it lives while asked for and for the buffer after
  if (p !== NONE && p !== b.dir) {
    if (b.req?.dir !== p) {
      cancelRequest(b);
      newRequest(b, p);
    } else b.req.idle = 0;
  } else if (b.req && ++b.req.idle > TURN_BUFFER_TICKS) cancelRequest(b);
  ageRequest(b);

  // the choice: the main direction if the body can take it, else the second axis (never stand against a wall while the other axis serves), else keep the heading
  if (p === NONE) take(map, b, b.req ? b.req.dir : NONE, inp.sx, inp.sy);
  else if (!take(map, b, p, inp.sx, inp.sy)) take(map, b, secondaryAxis(inp.sx, inp.sy, p), inp.sx, inp.sy);
}
