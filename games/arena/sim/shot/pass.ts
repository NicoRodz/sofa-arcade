// The passable Pegote. The body a Pegote rides presses B: if a rival of it stands on its tile or on an orthogonal neighbour, the Pegote jumps to that rival.
//  - Receiver: a body of the OTHER team than the carrier (so the carrier is always a rival of the Pegote's colour), not stained, not immune (Cambiazo's 0.5 s) and not
//    already carrying a Pegote. The nearest wins (same tile first); a tie goes to the lowest body index.
//  - The Pegote takes the colour (team, owner, radius) of whoever passes it: it always explodes against the receiver's team.
//  - After a pass: 30 ticks without a re-pass (`lock`), at most MAX_PASSES passes in the Pegote's life, and a fuse of at least PASS_MIN_FUSE ticks.
import { radiusOf } from '../events/comeback';
import type { ManchazoState, Pinata } from '../match/state';
import { bodyTile } from '../match/tile';
import { dist } from '../sabotage/near';
import { MAX_PASSES, PASS_LOCK_TICKS, PASS_MIN_FUSE } from './config';

/** The Pegote body i carries (the lowest id), or undefined. */
export const carried = (s: ManchazoState, i: number): Pinata | undefined =>
  s.match.pinatas.filter((p) => p.mod === 'glue' && p.stuck === i && p.passes !== undefined).sort((a, b) => a.id - b.id)[0];

const carries = (s: ManchazoState, j: number): boolean => s.match.pinatas.some((p) => p.mod === 'glue' && p.stuck === j);

/** The body that would take the Pegote of body i now, or -1. */
export function receiverOf(s: ManchazoState, i: number): number {
  const m = s.match;
  const me = s.grid.bodies[i]!;
  const here = bodyTile(me, m.bodies[i]!.face);
  let best = -1;
  let bestD = 2;
  s.grid.bodies.forEach((b, j) => {
    if (j === i || b.team === me.team || m.bodies[j]!.stun > 0 || (m.sab?.plus?.immune[j] ?? 0) > 0 || carries(s, j)) return;
    const d = dist(here, bodyTile(b, m.bodies[j]!.face));
    if (d < bestD) {
      best = j;
      bestD = d;
    }
  });
  return best;
}

/** Whether body i could pass its Pegote right now (it carries one whose lock and cap allow it), whoever is near. */
export function canPass(s: ManchazoState, i: number): boolean {
  const p = carried(s, i);
  return !!p && (p.lock ?? 0) === 0 && (p.passes ?? 0) < MAX_PASSES && s.match.bodies[i]!.stun === 0;
}

/** Body i presses B while carrying a Pegote: passes it when it can. False (nothing happened) otherwise, and B plays the card in hand as usual. */
export function tryPass(s: ManchazoState, i: number): boolean {
  const sh = s.match.sab?.shot;
  if (!sh || !canPass(s, i)) return false;
  const j = receiverOf(s, i);
  if (j < 0) return false;
  const m = s.match;
  const p = carried(s, i)!;
  const [x, y] = bodyTile(s.grid.bodies[j]!, m.bodies[j]!.face);
  const team = s.grid.bodies[i]!.team;
  Object.assign(p, {
    stuck: j,
    team,
    owner: i,
    x,
    y,
    radius: radiusOf(m, team),
    passes: (p.passes ?? 0) + 1,
    lock: PASS_LOCK_TICKS,
    fuse: Math.max(p.fuse, PASS_MIN_FUSE),
  });
  sh.log.push({ kind: 'pass', tick: s.grid.tick, body: i, target: j, x, y, card: 'glue' });
  return true;
}
