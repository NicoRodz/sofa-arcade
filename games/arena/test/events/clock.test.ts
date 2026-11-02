import { describe, expect, it } from 'vitest';
import { CLOCK_FROM_TICKS, CLOCK_LIVE_TICKS, CLOCK_WARN_TICKS, isHidden } from '../../sim';
import { DROP, put } from '../match-drive';
import { borders, evRound, left, lead, paintRect, quiet, run, untilEnd } from './ev-drive';

const BIG = 70; // a lead well over 15 % on the F0 map (about 400 floor tiles)

/** Team `loser` trails; the Hourglass falls at 30 s left. Returns the round at the tick it fell. */
function fallen(loser: number, teams: readonly number[] = [0, 1]) {
  const s = quiet(evRound(3, teams));
  lead(s, 1 - loser, BIG);
  untilEnd(s, CLOCK_FROM_TICKS);
  run(s, 1);
  return s;
}
const clock = (s: ReturnType<typeof evRound>) => s.match.ev!.clock;
/** The 3 s of warning, but the last tick: the next step goes live and charges for the first time. */
const warmup = (s: ReturnType<typeof evRound>) => run(s, CLOCK_WARN_TICKS - 1);
const circle = (s: ReturnType<typeof evRound>, team: number) => paintRect(s, team, 12, 6, 14, 8); // F0 map: the circle is rows 6-8

describe('Hourglass: appearance', () => {
  it('at 30 s left, losing by more than 15 %: it falls on the middle line (row 7), announced for the losing team, whichever team that is', () => {
    for (const loser of [0, 1]) {
      const s = fallen(loser);
      expect(clock(s)).toMatchObject({ phase: 'warn', team: loser, row: 7 });
      expect(s.match.ev!.log.filter((a) => a.kind === 'clockWarn')).toEqual([
        { kind: 'clockWarn', tick: s.grid.durationTicks - CLOCK_FROM_TICKS, team: loser },
      ]);
    }
  });
  it('not before 30 s, not when the gap is 15 % or less', () => {
    const early = quiet(evRound());
    lead(early, 0, BIG);
    untilEnd(early, CLOCK_FROM_TICKS + 60);
    run(early, 1);
    expect(clock(early).phase).toBe('idle');
    const close = quiet(evRound());
    lead(close, 0, borders(close.match.paintable).lo); // 14.9 %
    untilEnd(close, CLOCK_FROM_TICKS);
    run(close, 120);
    expect(clock(close).phase).toBe('idle');
  });
  it('it keeps checking every second: a gap that opens later makes it fall later (still with time to be live before the hidden scoreboard)', () => {
    const s = quiet(evRound());
    untilEnd(s, CLOCK_FROM_TICKS);
    run(s, 300);
    expect(clock(s).phase).toBe('idle');
    lead(s, 0, BIG);
    run(s, 60);
    expect(clock(s)).toMatchObject({ phase: 'warn', team: 1 });
    const late = quiet(evRound());
    lead(late, 0, BIG);
    untilEnd(late, 600 + CLOCK_WARN_TICKS); // 13 s: too late to be disputed
    run(late, 1);
    expect(clock(late).phase).toBe('idle');
  });
});

describe('Hourglass: charge', () => {
  it("while the 3 s of warning run nothing charges; with the 9 tiles in the loser's colour and one of its players alone inside it fills in 4 s: +15 s and ¡TIEMPO EXTRA!", () => {
    const s = fallen(0);
    circle(s, 0);
    put(s, 0, 13, 7);
    warmup(s);
    expect(clock(s)).toMatchObject({ phase: 'warn', charge: 0 });
    const end = s.grid.durationTicks;
    run(s, 239);
    expect(clock(s).phase).toBe('live'); // 239 ticks of charge: not yet
    expect(clock(s).charge).toBe(9 * 239);
    run(s, 1);
    expect(clock(s)).toMatchObject({ phase: 'done', outcome: 'filled' });
    expect(s.grid.durationTicks).toBe(end + 900);
    expect(s.match.ev!.log.at(-1)).toMatchObject({ kind: 'overtime', team: 0 }); // the TV's "¡TIEMPO EXTRA!"
    expect(isHidden(s)).toBe(false);
  });
  it('the hidden scoreboard counts from the new end', () => {
    const s = fallen(1);
    circle(s, 1);
    put(s, 1, 13, 7);
    warmup(s);
    run(s, 240);
    expect(clock(s).outcome).toBe('filled');
    untilEnd(s, 600 + 1);
    expect(isHidden(s)).toBe(false);
    run(s, 1);
    expect(isHidden(s)).toBe(true);
    expect(left(s)).toBe(600);
  });
  it("speed is proportional to the loser's tiles in the circle: 6 of 9 tiles take 6 s", () => {
    const s = fallen(0);
    paintRect(s, 0, 12, 6, 14, 7); // 6 tiles
    put(s, 0, 13, 7);
    warmup(s);
    run(s, 100);
    expect(clock(s).charge).toBe(6 * 100);
    run(s, 259);
    expect(clock(s).phase).toBe('live');
    run(s, 1);
    expect(clock(s).outcome).toBe('filled'); // 360 ticks
  });
  it('without a player of the loser inside, or with a rival inside, the charge stays frozen', () => {
    const s = fallen(0);
    circle(s, 0);
    put(s, 0, 2, 2);
    put(s, 1, 24, 12);
    warmup(s);
    run(s, 60);
    expect(clock(s).charge).toBe(0); // nobody inside
    put(s, 0, 13, 7);
    run(s, 30);
    const c = clock(s).charge;
    expect(c).toBe(9 * 30);
    put(s, 1, 14, 6); // a rival steps in: frozen
    run(s, 60);
    expect(clock(s).charge).toBe(c);
    put(s, 1, 24, 12); // leaves: it moves again
    run(s, 10);
    expect(clock(s).charge).toBe(c + 90);
  });
  it("the leader repaints circle tiles: slower, and under 3 tiles of the loser's colour the bar goes back", () => {
    const s = fallen(0);
    circle(s, 0);
    put(s, 0, 13, 7);
    put(s, 1, 24, 12);
    warmup(s);
    run(s, 60);
    expect(clock(s).charge).toBe(540);
    paintRect(s, 1, 12, 6, 14, 6); // the rival takes the top row: 6 left
    run(s, 10);
    expect(clock(s).charge).toBe(540 + 60);
    paintRect(s, 1, 12, 7, 14, 7); // 3 left: still charges (3 per tick)
    run(s, 10);
    expect(clock(s).charge).toBe(600 + 30);
    paintRect(s, 1, 12, 8, 12, 8); // 2 left: goes back 9 a tick
    run(s, 10);
    expect(clock(s).charge).toBe(630 - 90);
    run(s, 100);
    expect(clock(s).charge).toBe(0); // never below 0
  });
  it("staining the carrier takes him out of the circle: the charge stops (the rival's pinata, the real blast)", () => {
    const s = fallen(0);
    circle(s, 0);
    put(s, 0, 13, 7);
    put(s, 1, 13, 10); // behind furniture? (13, 9) is a table: the rival drops on the open side
    put(s, 1, 11, 7);
    warmup(s);
    run(s, 20);
    run(s, 1, { 1: DROP });
    run(s, 119); // fuse 2 s: the blast reaches (13, 7): the carrier is stained
    const stunned = s.match.bodies[0]!.stun;
    expect(stunned).toBeGreaterThan(0);
    const c = clock(s).charge;
    put(s, 1, 24, 12);
    run(s, 30);
    expect(clock(s).charge).toBe(c); // stained and rival repainted: no charge
  });
});

describe('Hourglass: ending', () => {
  it('breaks 12 s after it goes live if it is not full, and never comes back in the round (max once)', () => {
    const s = fallen(0);
    circle(s, 0);
    put(s, 0, 2, 2);
    run(s, CLOCK_WARN_TICKS + CLOCK_LIVE_TICKS - 1);
    expect(clock(s).phase).toBe('live');
    run(s, 1);
    expect(clock(s)).toMatchObject({ phase: 'done', outcome: 'broken' });
    expect(s.match.ev!.log.at(-1)).toMatchObject({ kind: 'clockBroken' });
    run(s, 300); // the gap is still there at the following seconds
    expect(clock(s).phase).toBe('done');
    expect(s.match.ev!.log.filter((a) => a.kind === 'clockWarn')).toHaveLength(1);
    expect(s.match.ev!.log.filter((a) => a.kind === 'clockBroken')).toHaveLength(1);
  });
  it('a filled one does not come back either, even with the gap still open', () => {
    const s = fallen(0);
    circle(s, 0);
    put(s, 0, 13, 7);
    warmup(s);
    run(s, 240 + 600);
    expect(s.match.ev!.log.filter((a) => a.kind === 'clockWarn')).toHaveLength(1);
    expect(clock(s).outcome).toBe('filled');
  });
  it('nobody charged it and the hidden scoreboard starts: it is gone', () => {
    const s = quiet(evRound());
    lead(s, 0, BIG);
    untilEnd(s, 600 + 7 * 60); // falls with 17 s left: live at 14 s, hidden at 10 s
    run(s, 1);
    expect(clock(s).phase).toBe('warn');
    run(s, 7 * 60);
    expect(clock(s)).toMatchObject({ phase: 'done', outcome: 'gone' });
    expect(isHidden(s)).toBe(true);
  });
});
