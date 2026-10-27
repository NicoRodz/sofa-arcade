// Bot job of 'beltReverse', implemented by T1b: the golden chefs already out-walk a belt (3.3 t/s against it), so the job is only to know when the flip is near. `wants` is true in the 180-tick warning;
// `beltAssist` leaves the controls alone but counts the chefs caught on a belt at the flip (the report's "ridden" figure).
import type { MechBot } from '@pichi/game-pizzas/sim/mech/types';
import type { Controls, Game } from '@pichi/game-pizzas/sim/overcooked';
import { surfaceAt } from '@pichi/game-pizzas/sim/surfaces/physics';

export const beltReverseBot: MechBot = { wants: (g) => !!g.mech?.belt && g.mech.belt.next <= 180 };

export interface BeltBotState {
  flips: number;
  ridden: number; // chefs standing on a belt at a flip
  last: boolean;
}
export const newBeltBot = (): BeltBotState => ({ flips: 0, ridden: 0, last: false });
export function beltAssist(g: Game, _base: Map<number, Controls>, st: BeltBotState) {
  const b = g.mech?.belt;
  if (!b || b.reversed === st.last) return;
  st.last = b.reversed;
  st.flips++;
  for (const p of g.players.values()) if (!p.ghost && surfaceAt(g, p.x, p.y)?.kind === 'belt') st.ridden++;
}
