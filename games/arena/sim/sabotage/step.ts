// Per-tick work of the sabotages, in the two slots the plan gives them: before movement (`beforeMove`: cards played, the roller takes the wheel) and after it
// (`afterMove`: the roller and the footprints paint, pickups are collected and come back).
import { NONE } from '../grid/dir';
import { paintTile } from '../match/board';
import type { ManchazoState } from '../match/state';
import { bodyTile } from '../match/tile';
import { pairOut, respawnTicks } from '../phase/pickups';
import { PICKUP_RESPAWN_TICKS } from './kinds';
import { cardOf } from './state';
import { stepPlus } from './plus-step';
import { useSabotage } from './use';

export const isRolling = (s: ManchazoState, i: number): boolean => (s.match.sab?.roller[i] ?? 0) > 0;

/** Cards played this tick (`uses[i]`: button 2 pressed), then every rolling body is pointed along its heading: its stick is ignored. */
export function beforeMove(s: ManchazoState, uses: readonly boolean[]): void {
  const a = s.match.sab;
  if (!a) return;
  s.grid.bodies.forEach((_b, i) => uses[i] && useSabotage(s, i));
  s.grid.bodies.forEach((b, i) => {
    const bm = s.match.bodies[i]!;
    if (a.roller[i]! > 0 && bm.stun === 0) {
      b.dir = bm.face;
      b.q = NONE;
      b.req = null;
    }
  });
  a.gust.forEach((g, i) => g > 0 && a.gust[i]!--);
}

export function afterMove(s: ManchazoState): void {
  const m = s.match;
  const a = m.sab;
  if (!a) return;
  s.grid.bodies.forEach((b, i) => {
    const bm = m.bodies[i]!;
    if (bm.stun > 0) {
      a.roller[i] = 0; // a stain cuts the roller
      return;
    }
    const tile = bodyTile(b, bm.face);
    if (a.roller[i]! > 0) {
      paintTile(m, ...tile, b.team, s.grid.tick);
      if (--a.roller[i]! === 0 || !b.moved) a.roller[i] = 0; // runs out, or a wall stops it
    }
    if (a.footprints[b.team]! > 0 && b.moved) paintTile(m, ...tile, 1 - b.team, s.grid.tick);
    if (a.held[i] === null)
      for (const [k, p] of a.pickups.entries())
        if (p.wait === 0 && pairOut(m, p.pair) && p.x === tile[0] && p.y === tile[1]) {
          a.held[i] = cardOf(a, p);
          if (m.res) m.res.from[i] = k; // PR3: the spawner a dropped card goes back to
          p.drawn++;
          p.wait = respawnTicks(m, PICKUP_RESPAWN_TICKS);
          break;
        }
  });
  a.footprints.forEach((t, k) => t > 0 && a.footprints[k]!--);
  for (const p of a.pickups) if (p.wait > 0) p.wait--;
  stepPlus(s); // F8a: tapes, ink, sponge, Mareo's charge, dizziness and immunity (no-op without the flag)
}
