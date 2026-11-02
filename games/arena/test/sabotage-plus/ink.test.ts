import { describe, expect, it } from 'vitest';
import { paintTile, shownCounts, shownPaint, shownPercent } from '../../sim';
import { DROP, USE, countsAgree, give, plus, plusRound, put, sab, tick } from './plus-drive';

/** Body 0 (team 0) uses the ink on (4, 0) and drops a pinata; body 1 (team 1) is far away. */
function inked() {
  const s = plusRound([0, 1]);
  put(s, 0, 4, 0);
  put(s, 1, 22, 14);
  give(s, 0, 'ink');
  tick(s, { 0: USE });
  tick(s, { 0: DROP });
  return s;
}

describe('ink: for 6 s your new paint reads neutral on the TV and out of the marker, then it shows at once', () => {
  it('the sim counts it, the TV and the marker do not', () => {
    const s = inked();
    tick(s, {}, 125);
    const painted = s.match.counts[0]!;
    expect(painted).toBeGreaterThan(5);
    expect(sab(s).used).toBe(1);
    expect(plus(s).veil).toEqual([360 - 127, 0]);
    expect(shownCounts(s)).toEqual([0, 0]);
    expect(shownPercent(s, 0)).toBe(0);
    expect(shownPaint(s).every((v) => v === -1)).toBe(true);
    expect(s.match.paint.filter((v) => v === 0).length).toBe(painted); // the real floor has it
    expect(countsAgree(s)).toBe(true);
  });
  it('shows everything at once when the 6 s end, and paint put down after that is not hidden', () => {
    const s = inked();
    tick(s, {}, 125);
    const painted = s.match.counts[0]!;
    tick(s, {}, 360 - 127 - 1);
    expect(shownCounts(s)).toEqual([0, 0]); // one tick before
    tick(s);
    expect(plus(s).veil[0]).toBe(0);
    expect(shownCounts(s)).toEqual([painted, 0]);
    expect(shownPaint(s)).toEqual(s.match.paint);
    paintTile(s.match, 20, 14, 0, s.grid.tick);
    expect(shownCounts(s)).toEqual([painted + 1, 0]);
  });
  it('the other team is not hidden: its paint shows while yours does not', () => {
    const s = inked();
    paintTile(s.match, 20, 0, 1, 0);
    tick(s, {}, 125);
    expect(shownCounts(s)).toEqual([0, 1]);
    expect(shownPaint(s)[20]).toBe(1);
  });
  it('counter: a rival blast (or the erasing aguarras) takes hidden tiles like any other and they stop being hidden', () => {
    const s = inked();
    tick(s, {}, 125);
    put(s, 1, 5, 0);
    tick(s, { 1: DROP }); // the rival repaints around (5, 0)
    put(s, 1, 22, 14);
    tick(s, {}, 125);
    expect(shownCounts(s)[1]).toBe(s.match.counts[1]); // the rival's new paint is not hidden
    const hiddenLeft = plus(s).veiled.reduce((n, v) => n + v, 0);
    expect(shownCounts(s)[0]).toBe(s.match.counts[0]! - hiddenLeft);
    expect(countsAgree(s)).toBe(true);
  });
  it('once the round is over the TV shows the real floor', () => {
    const s = inked();
    tick(s, {}, 125);
    s.grid.over = true;
    expect(shownCounts(s)).toEqual(s.match.counts);
    expect(shownPaint(s)).toBe(s.match.paint);
  });
});
