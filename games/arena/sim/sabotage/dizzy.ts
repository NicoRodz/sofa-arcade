// Mareo (F8a): the stick of a dizzy body is read backwards, and the phones near a charge are warned. Both read the state; the charge and the countdown live in plus-step.ts.
import type { ManchazoState } from '../match/state';
import { bodyTile } from '../match/tile';
import { DIZZY_RANGE } from './kinds';
import { dist } from './near';

/** The input body i is steered by: its own, or with both axes flipped while it is dizzy. The same object when it is not (nothing to allocate on the common path). */
export function dizzyInput<T extends { sx: number; sy: number }>(s: ManchazoState, i: number, inp: T): T {
  return (s.match.sab?.plus?.dizzy[i] ?? 0) > 0 ? { ...inp, sx: -inp.sx, sy: -inp.sy } : inp;
}

/** Is a rival of body i charging a Mareo that will reach it where it stands now? (The phone buzzes and warns: the charge leaves time to walk away.) */
export function dizzyThreat(s: ManchazoState, i: number): boolean {
  const p = s.match.sab?.plus;
  if (!p) return false;
  const me = s.grid.bodies[i]!;
  const here = bodyTile(me, s.match.bodies[i]!.face);
  return s.grid.bodies.some(
    (b, k) => b.team !== me.team && p.charge[k]! > 0 && dist(here, bodyTile(b, s.match.bodies[k]!.face)) <= DIZZY_RANGE,
  );
}
