// The acts' slot in the tick (inside the events' step, after the Hourglass so its extra time is already in the round's end and before the hidden-scoreboard check): the act
// switches, the change is announced 120 ticks before and again when it happens, the Final lengthens every pinata on the floor and speeds the living parts, and the last 10 s
// decide whether they are played blind. Nothing here draws from an RNG.
import { HIDDEN_TICKS } from '../events/config';
import { announce } from '../events/state';
import { WARN_TICKS as LIVING_WARN } from '../living/config';
import type { ManchazoState } from '../match/state';
import {
  FINAL_RADIUS_BONUS,
  FINAL_TICKS,
  HIDDEN_MAX_GAP_PP,
  LIVING_SPEED_DEN,
  LIVING_SPEED_NUM,
  PHASES,
  RADIUS_CAP,
  PHASE_WARN_TICKS,
  openingTicks,
  rawPhase,
} from './config';
import type { PhaseState } from './state';

/** The tick of the next change of act (null in the Final). The Final's is counted from the round's current end, so extra time moves it. */
export const nextPhaseChange = (ph: PhaseState, duration: number): number | null =>
  ph.phase === 'opening' ? openingTicks(ph.base) : ph.phase === 'scramble' ? duration - FINAL_TICKS : null;

type Clock = { period: number; offset: number };

/** Runs a living clock x0.75 from tick `t`: the change already close keeps its tick (never shorter than its 1 s warning), the others are scaled. */
function speedUp(c: Clock, t: number): void {
  const left = c.period - ((t + c.offset) % c.period);
  const period = Math.floor((c.period * LIVING_SPEED_NUM) / LIVING_SPEED_DEN);
  const scaled = left <= LIVING_WARN ? left : Math.max(LIVING_WARN, Math.ceil((left * LIVING_SPEED_NUM) / LIVING_SPEED_DEN));
  c.offset = ((-(t + scaled) % period) + period) % period; // the next change falls on t + scaled
  c.period = period;
}

function enterFinal(s: ManchazoState): void {
  const m = s.match;
  for (const p of m.pinatas) p.radius = Math.min(p.radius + FINAL_RADIUS_BONUS, RADIUS_CAP); // the pinatas already on the floor too
  if (m.live) for (const c of [...m.live.pairs, ...(m.live.fountain ? [m.live.fountain] : [])]) speedUp(c, s.grid.tick);
}

export function stepPhase(s: ManchazoState): void {
  const m = s.match;
  const ph = m.ph!;
  const ev = m.ev!;
  const t = s.grid.tick;
  const dur = s.grid.durationTicks;
  const raw = rawPhase(t, dur, ph.base);
  if (PHASES.indexOf(raw) > PHASES.indexOf(ph.phase)) {
    ph.phase = raw; // latched: if the Hourglass adds time during the Final, the round stays in the Final
    announce(ev, raw === 'final' ? 'phaseFinal' : 'phaseScramble', t);
    if (raw === 'final') enterFinal(s);
  }
  const next = nextPhaseChange(ph, dur);
  if (next !== null && t >= next - PHASE_WARN_TICKS && ph.warned !== next) {
    ph.warned = next;
    announce(ev, ph.phase === 'opening' ? 'warnScramble' : 'warnFinal', t);
  }
  if (ph.hidden === null && dur - t <= HIDDEN_TICKS)
    ph.hidden = Math.abs(m.counts[0]! - m.counts[1]!) * 100 <= HIDDEN_MAX_GAP_PP * m.paintable; // whole tiles, like the come-back's gap
}
