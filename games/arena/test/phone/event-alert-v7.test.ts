// F9: the TV's announcements buzz every phone with `alert`; the change of ACT and the Hourglass going live have their own, louder kinds (`phase`, `hourglass`).
import { describe, expect, it } from 'vitest';
import { CLOCK_FROM_TICKS, CLOCK_WARN_TICKS, openingTicks, stepManchazo, type ManchazoState } from '../../sim';
import { createEventAlert } from '../../screen/match/event-alert';
import { evRound, lead, quiet, untilEnd } from '../events/ev-drive';
import { phaseRound, quietEvents } from '../phase/phase-drive';

/** Steps one tick at a time with a sync after each frame (the real screen syncs after every frame). */
function watch(s: ManchazoState, ticks: number, alert: ReturnType<typeof createEventAlert>) {
  for (let k = 0; k < ticks; k++) {
    stepManchazo(s, new Map());
    alert.sync(s);
  }
}
const make = () => {
  const sent: { playerId: number; kind: string; tick: number }[] = [];
  let s: ManchazoState | null = null;
  const alert = createEventAlert(
    (m) => void sent.push({ playerId: m.playerId, kind: m.kind, tick: s!.grid.tick }),
    (slot) => slot + 10,
  );
  return { sent, alert, bind: (x: ManchazoState) => (s = x) };
};
const forPhone = (sent: { playerId: number; kind: string }[], id = 10) => sent.filter((m) => m.playerId === id).map((m) => m.kind);

describe('event alerts: phase and hourglass', () => {
  it('the change of act buzzes `phase` on every phone (the warning before it stays `alert`)', () => {
    const { sent, alert, bind } = make();
    const s = quietEvents(phaseRound([0, 1]));
    bind(s);
    alert.sync(s);
    watch(s, openingTicks(s.grid.durationTicks) + 5, alert);
    expect(forPhone(sent, 10)).toEqual(['alert', 'phase']); // warnScramble, then phaseScramble
    expect(forPhone(sent, 11)).toEqual(['alert', 'phase']);
  });
  it('the Hourglass: its fall is announced with `alert`, and the moment it goes live buzzes `hourglass` once', () => {
    const { sent, alert, bind } = make();
    const s = quiet(evRound(3, [0, 1]));
    bind(s);
    lead(s, 1, 70);
    untilEnd(s, CLOCK_FROM_TICKS);
    alert.sync(s);
    watch(s, CLOCK_WARN_TICKS - 2, alert);
    expect(s.match.ev!.clock.phase).toBe('warn');
    expect(forPhone(sent, 10)).toEqual(['alert']);
    watch(s, 5, alert);
    expect(s.match.ev!.clock.phase).toBe('live');
    expect(forPhone(sent, 10)).toEqual(['alert', 'hourglass']);
    watch(s, 60, alert);
    expect(forPhone(sent, 10)).toEqual(['alert', 'hourglass']); // not again while it stays live
  });
});
