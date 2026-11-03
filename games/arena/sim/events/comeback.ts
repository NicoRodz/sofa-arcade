// The come-back: checked every second; when a team trails by more than 15 % of the floor its pinatas get +1 radius for 10 s, then 20 s of cooldown.
import { TICK_HZ } from '../grid/config';
import type { ManchazoState, MatchState } from '../match/state';
import { capRadius, finalBonus } from '../phase/radius';
import { COMEBACK_BONUS, COMEBACK_COOLDOWN_TICKS, COMEBACK_TICKS } from './config';
import { losingTeam } from './gap';
import { announce } from './state';

/** The blast radius of a pinata `team` drops now: its own (with the small-team edge) plus the come-back's bonus while that runs. */
export const radiusOf = (m: MatchState, team: number): number =>
  capRadius(m, m.radius[team]! + (m.ev?.comeback.team === team ? COMEBACK_BONUS : 0) + finalBonus(m)); // PR2: the Final's +1 and the cap (no-ops without the flag)

export function stepComeback(s: ManchazoState): void {
  const ev = s.match.ev!;
  const t = s.grid.tick;
  const c = ev.comeback;
  if (c.team >= 0 && t >= c.until) {
    c.team = -1;
    c.cool = t + COMEBACK_COOLDOWN_TICKS;
  }
  if (t % TICK_HZ !== 0 || c.team >= 0 || t < c.cool) return;
  const loser = losingTeam(s.match);
  if (loser < 0) return;
  c.team = loser;
  c.until = t + COMEBACK_TICKS;
  announce(ev, 'comeback', t, loser);
}
