// What the stick means for one body each tick, per control plan. Plan A: the body goes where the (quantized) stick points, stops on release; a turn
// into a wall is kept 150 ms and runs at the next free junction (corner assist aligns within 0.35 tile). Plan B: the body keeps its heading until
// a wall; the stick only asks for turns (same buffer), and pushing backwards is a U-turn.
import { TURN_BUFFER_TICKS } from './config';
import { NONE, opposite } from './dir';
import { ageRequest, cancelRequest, executeRequest, newRequest } from './metrics';
import { tryHeading } from './move';
import { quantizeStick } from './quantize';
import type { GridBody, GridInput } from './state';
import type { ControlPlan } from './config';

export function steer(b: GridBody, inp: GridInput, plan: ControlPlan): void {
  const q = quantizeStick(inp.sx, inp.sy, b.q);
  const changed = q !== b.q;
  b.q = q;
  if (changed) {
    cancelRequest(b);
    if (q !== NONE && q !== b.dir) newRequest(b, q);
  } else ageRequest(b);

  if (q === NONE) {
    if (plan === 'A') b.dir = NONE;
    return;
  }
  if (q === b.dir) return;
  if (!b.req) return; // unchanged stick that already ran its request
  if (b.dir !== NONE && q === opposite(b.dir)) {
    b.dir = q; // straight back along the same corridor: nothing to align
    executeRequest(b);
    return;
  }
  // a turn (or a start from rest). While the body runs, the request is tried only for the buffer's 150 ms; at rest it is tried every tick.
  const running = b.dir !== NONE && b.moved;
  if (running && b.req.age >= TURN_BUFFER_TICKS) {
    if (plan === 'A') b.dir = NONE; // out of buffer: plan A stands, pushing against what blocks it
    return;
  }
  if (tryHeading(b, q)) executeRequest(b);
  else if (plan === 'A' && !running) b.dir = NONE;
}
