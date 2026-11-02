// Who is close to whom: Manhattan distance between the tiles the bodies stand on.
import type { ManchazoState } from '../match/state';
import { bodyTile } from '../match/tile';

export const dist = (a: readonly number[], b: readonly number[]): number => Math.abs(a[0]! - b[0]!) + Math.abs(a[1]! - b[1]!);

/** The nearest rival body of body i within `range` tiles (ties: the lowest index), or -1. */
export function nearestRival(s: ManchazoState, i: number, range: number): number {
  const me = s.grid.bodies[i]!;
  const here = bodyTile(me, s.match.bodies[i]!.face);
  let best = -1;
  let bestD = range + 1;
  s.grid.bodies.forEach((b, j) => {
    if (b.team === me.team) return;
    const d = dist(here, bodyTile(b, s.match.bodies[j]!.face));
    if (d < bestD) {
      best = j;
      bestD = d;
    }
  });
  return best;
}
