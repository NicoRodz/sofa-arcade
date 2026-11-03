// The events' slot in the tick (after the pinatas and the paint, before the clock check): the scheduled event, the come-back, the Hourglass and the
// hidden scoreboard's announcement.
import type { ManchazoState } from '../match/state';
import { stepClock, isHidden } from './clock';
import { stepComeback } from './comeback';
import { stepPhase } from '../phase/step';
import { stepMajor } from './major';
import { announce } from './state';

export function stepEvents(s: ManchazoState): void {
  const ev = s.match.ev;
  if (!ev) return;
  stepMajor(s);
  stepComeback(s);
  stepClock(s);
  if (s.match.ph) stepPhase(s); // PR2: after the Hourglass (its extra time is in the round's end), before the hidden scoreboard's check
  if (!ev.hiddenShown && isHidden(s)) {
    ev.hiddenShown = true;
    announce(ev, 'hidden', s.grid.tick);
  }
}
