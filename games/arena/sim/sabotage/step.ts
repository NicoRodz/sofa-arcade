// Per-tick work of the sabotages, in the two slots the plan gives them: before movement (`beforeMove`: cards played, the roller takes the wheel) and after it
// (`afterMove`: the roller and the footprints paint, pickups are collected and come back).
import { NONE } from '../grid/dir';
import { paintTile } from '../match/board';
import type { ManchazoState } from '../match/state';
import { bodyTile } from '../match/tile';
import { PICKUP_RESPAWN_TICKS } from './kinds';
import { cardOf } from './state';
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
    if (bm.stun > 0) return void (a.roller[i] = 0); // a stain cuts the roller
    const tile = bodyTile(b, bm.face);
    if (a.roller[i]! > 0) {
      paintTile(m, ...tile, b.team, s.grid.tick);
      if (--a.roller[i]! === 0 || !b.moved) a.roller[i] = 0; // runs out, or a wall stops it
    }
    if (a.footprints[b.team]! > 0 && b.moved) paintTile(m, ...tile, 1 - b.team, s.grid.tick);
    if (a.held[i] === null)
      for (const p of a.pickups)
        if (p.wait === 0 && p.x === tile[0] && p.y === tile[1]) {
          a.held[i] = cardOf(a, p);
          p.drawn++;
          p.wait = PICKUP_RESPAWN_TICKS;
          break;
        }
  });
  a.footprints.forEach((t, k) => t > 0 && a.footprints[k]!--);
  for (const p of a.pickups) if (p.wait > 0) p.wait--;
}
