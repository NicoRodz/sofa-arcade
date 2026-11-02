// The disputed Hourglass (Nico, 2-nov-2026, replaces the plan's). At 30 s left, if a team trails by more than 15 %, it falls on the middle line inside a 3x3
// circle (3 s of warning, then 12 s to dispute). It charges only while a player of the LOSING team stands in the circle and no rival does, at a speed
// proportional to the circle's tiles in the loser's colour (nine: 4 s). The leader stops it with a body inside (frozen), by repainting (slower; under 3
// tiles of the loser's colour the bar goes back) or by staining the carrier (a stained body is out of the circle). Full: +15 s and "¡TIEMPO EXTRA!".
// Not full in 12 s: it breaks. At most one per round; it is gone when the hidden scoreboard starts.
import { TICK_HZ } from '../grid/config';
import type { ManchazoState } from '../match/state';
import { MAP_W } from '../../map';
import { bodyTile } from '../match/tile';
import {
  CLOCK_EXTRA_TICKS,
  CLOCK_FROM_TICKS,
  CLOCK_FULL,
  CLOCK_LIVE_TICKS,
  CLOCK_MIN_PAINT,
  CLOCK_RETREAT,
  CLOCK_WARN_TICKS,
  CLOCK_X,
  HIDDEN_TICKS,
} from './config';
import { losingTeam } from './gap';
import { announce } from './state';

export const isHidden = (s: ManchazoState): boolean => !!s.match.ev && !s.grid.over && s.grid.durationTicks - s.grid.tick <= HIDDEN_TICKS;

const inCircle = (row: number, x: number, y: number): boolean => Math.abs(x - CLOCK_X) <= 1 && Math.abs(y - row) <= 1;

export function stepClock(s: ManchazoState): void {
  const m = s.match;
  const ev = m.ev!;
  const c = ev.clock;
  const t = s.grid.tick;
  const left = s.grid.durationTicks - t;
  if (c.phase === 'idle') {
    // it must still be able to go live before the hidden scoreboard: warning + the first second of dispute fit
    if (t % TICK_HZ !== 0 || left > CLOCK_FROM_TICKS || left <= HIDDEN_TICKS + CLOCK_WARN_TICKS) return;
    const loser = losingTeam(m);
    if (loser < 0) return;
    Object.assign(c, { phase: 'warn', team: loser, liveAt: t + CLOCK_WARN_TICKS, endsAt: t + CLOCK_WARN_TICKS + CLOCK_LIVE_TICKS });
    announce(ev, 'clockWarn', t, loser);
    return;
  }
  if (c.phase === 'warn' && t >= c.liveAt) c.phase = 'live';
  if (c.phase !== 'live') return;
  if (isHidden(s) || t >= c.endsAt) {
    c.phase = 'done';
    c.outcome = isHidden(s) ? 'gone' : 'broken';
    if (c.outcome === 'broken') announce(ev, 'clockBroken', t, c.team);
    return;
  }
  const here = [0, 0];
  s.grid.bodies.forEach((b, i) => {
    const bm = m.bodies[i]!;
    const [x, y] = bodyTile(b, bm.face);
    if (bm.stun === 0 && inCircle(c.row, x, y)) here[b.team]!++;
  });
  let painted = 0;
  for (let y = c.row - 1; y <= c.row + 1; y++)
    for (let x = CLOCK_X - 1; x <= CLOCK_X + 1; x++) if (m.paint[y * MAP_W + x] === c.team) painted++;
  if (painted < CLOCK_MIN_PAINT) c.charge = Math.max(0, c.charge - CLOCK_RETREAT);
  else if (here[c.team]! > 0 && here[1 - c.team]! === 0) c.charge += painted;
  if (c.charge >= CLOCK_FULL) {
    c.charge = CLOCK_FULL;
    c.phase = 'done';
    c.outcome = 'filled';
    s.grid.durationTicks += CLOCK_EXTRA_TICKS;
    announce(ev, 'overtime', t, c.team);
  }
}
