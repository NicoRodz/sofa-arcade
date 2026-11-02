// The F8a sabotages' clocks, once per tick after movement: tapes wear off, the ink runs out (and reveals), the sponge dries, the dizzy charge fires, dizziness and immunity end.
import { bodyTile } from '../match/tile';
import type { ManchazoState } from '../match/state';
import { DIZZY_RANGE, DIZZY_TICKS } from './kinds';
import { dist } from './near';

function fire(s: ManchazoState, i: number): void {
  const plus = s.match.sab!.plus!;
  const me = s.grid.bodies[i]!;
  const here = bodyTile(me, s.match.bodies[i]!.face);
  s.grid.bodies.forEach((b, j) => {
    if (b.team === me.team || plus.immune[j]! > 0) return;
    if (dist(here, bodyTile(b, s.match.bodies[j]!.face)) <= DIZZY_RANGE) plus.dizzy[j] = DIZZY_TICKS;
  });
}

export function stepPlus(s: ManchazoState): void {
  const a = s.match.sab!;
  const p = a.plus;
  if (!p) return;
  for (const t of p.tapes) t.left--;
  p.tapes = p.tapes.filter((t) => t.left > 0);
  p.veil.forEach((v, team) => {
    if (v === 0 || --p.veil[team]! > 0) return;
    // the ink ran out: everything it hid shows at once
    s.match.paint.forEach((c, k) => {
      if (c === team) p.veiled[k] = 0;
    });
  });
  for (const list of [p.dizzy, p.immune, p.swapFx, p.squeezeFx]) list.forEach((v, i) => v > 0 && list[i]!--);
  s.grid.bodies.forEach((_b, i) => {
    if (p.sponge[i]! > 0 && --p.sponge[i]! === 0) {
      p.soaked[i] = 0; // not squeezed in time: the paint is lost and the hand is empty
      if (a.held[i] === 'sponge') a.held[i] = null;
    }
    if (p.charge[i]! > 0 && --p.charge[i]! === 0) fire(s, i);
  });
}
