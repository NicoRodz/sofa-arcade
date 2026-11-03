// One tick of a Manchazo round (60 Hz). Mutates the state; same state + same inputs = same result.
// Order (the plan's): inputs by slot -> sabotages -> movement -> living map (F5) -> drops -> rescue and loot (PR3) -> stain and footprints -> shots (PR4) -> pinatas (placement order) -> events (F4: schedule, come-back, Hourglass; they may add to the round's length) -> clock. The sabotages' paint and pickups run right after movement.
import { NONE } from '../grid/dir';
import { steer } from '../grid/control';
import { advance } from '../grid/move';
import { NO_GRID_INPUT, type GridInput } from '../grid/state';
import { paintTile } from './board';
import { stepEvents } from '../events/step';
import { stepLiving } from '../living/step';
import { dizzyInput } from '../sabotage/dizzy';
import { afterMove, beforeMove, isRolling } from '../sabotage/step';
import { stepRescue } from '../rescue/step';
import { stepShots } from '../shot/step';
import { dropPinata, stepPinatas } from './pinata';
import { TRAIL_TICKS } from './config';
import type { ManchazoState } from './state';
import { bodyTile } from './tile';

/** What a phone asks of its body in a tick: the stick, and whether button 1 was pressed since the last tick. */
export interface ManchazoInput extends GridInput {
  drop: boolean;
  use?: boolean; // button 2 pressed since the last tick: plays the sabotage in hand
}
export const NO_MANCHAZO_INPUT: ManchazoInput = { ...NO_GRID_INPUT, drop: false };

export function stepManchazo(s: ManchazoState, inputs: ReadonlyMap<number, ManchazoInput>): void {
  const g = s.grid;
  if (g.over) return;
  const m = s.match;
  const stunned = (i: number) => m.bodies[i]!.stun > 0;
  beforeMove(
    s,
    g.bodies.map((b) => !!inputs.get(b.slot)?.use),
  );
  g.bodies.forEach((b, i) => {
    if (!stunned(i) && !isRolling(s, i)) steer(g.map, b, dizzyInput(s, i, inputs.get(b.slot) ?? NO_MANCHAZO_INPUT), g.control);
  });
  g.bodies.forEach((b, i) => {
    if (stunned(i)) return;
    advance(g.map, b);
    if (b.dir !== NONE) m.bodies[i]!.face = b.dir;
  });
  afterMove(s);
  stepLiving(s);
  g.bodies.forEach((b, i) => {
    if (!stunned(i) && (inputs.get(b.slot) ?? NO_MANCHAZO_INPUT).drop) dropPinata(s, i);
  });
  stepRescue(s); // PR3: before the stains count down: a rescue on the last tick of a stain wins, and the loot is picked up
  g.bodies.forEach((b, i) => {
    const bm = m.bodies[i]!;
    if (bm.stun > 0) {
      if (--bm.stun === 0) bm.trail = TRAIL_TICKS;
    } else if (bm.trail > 0) {
      bm.trail--;
      paintTile(m, ...bodyTile(b, bm.face), bm.trailTeam, g.tick);
    }
  });
  stepShots(s); // PR4: shots fly, aims launch (no-op without the flag)
  stepPinatas(s);
  stepEvents(s);
  g.tick++;
  if (g.tick >= g.durationTicks) g.over = true;
}
