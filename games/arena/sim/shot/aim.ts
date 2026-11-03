// Aiming (button 2 with a flying card in hand) and what cuts it. The card is not spent when B is pressed: it leaves with the shot, so a stain during the aim lets it fall as loot
// (or leaves it in hand when Rescue is off) and nothing flies.
import type { ManchazoState } from '../match/state';
import { bodyTile } from '../match/tile';
import { AIM_TICKS } from './config';

/** Body i starts aiming. False when it already is. */
export function startAim(s: ManchazoState, i: number): boolean {
  const sh = s.match.sab?.shot;
  if (!sh || sh.prep[i]! > 0) return false;
  sh.prep[i] = AIM_TICKS;
  return true;
}

/** A stain cuts the aim (called by the blast that stains body i). */
export function cancelAim(s: ManchazoState, i: number): void {
  const sh = s.match.sab?.shot;
  const card = s.match.sab?.held[i];
  if (!sh || !card || sh.prep[i]! <= 0) return;
  sh.prep[i] = 0;
  const [x, y] = bodyTile(s.grid.bodies[i]!, s.match.bodies[i]!.face);
  sh.log.push({ kind: 'cancel', tick: s.grid.tick, body: i, target: -1, x, y, card });
}
