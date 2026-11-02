import { describe, expect, it } from 'vitest';
import { BRUSH_TICKS, FOUNTAIN_TICKS, SOFA_TICKS, WARN_TICKS, nextChange, offsetOf } from '../../sim';
import { paintTile } from '../../sim';
import { put, tick } from '../match-drive';
import { brush, fountain, openRound, sofa } from './drive';

const pair = (s: ReturnType<typeof openRound>, i = 0) => s.match.live!.pairs[i]!;
/** The tick (of the tick counter before the step) at which the pair's state first differs from its start, running at most `max` ticks. */
function firstChange(s: ReturnType<typeof openRound>, max: number): number {
  const from = pair(s).state;
  for (let k = 0; k < max; k++) {
    tick(s);
    if (pair(s).state !== from) return pair(s).movedAt;
  }
  return -1;
}

describe('periods, exact in ticks (60 Hz)', () => {
  it("the plan's seconds: brush 4 s, sofa 5 s, fountain 8 s, warning 1 s", () => {
    expect([BRUSH_TICKS, SOFA_TICKS, FOUNTAIN_TICKS, WARN_TICKS]).toEqual([240, 300, 480, 60]);
  });

  it('the brush turns on tick 240, then every 240; 4 states, back to the first after 960', () => {
    const s = openRound([brush()]);
    expect(firstChange(s, 239)).toBe(-1); // 239 ticks: nothing yet
    expect(firstChange(s, 5)).toBe(240);
    const seen = [pair(s).state];
    for (let k = 0; k < 3; k++) {
      expect(firstChange(s, 240)).toBe(240 * (k + 2));
      seen.push(pair(s).state);
    }
    expect(seen).toEqual([1, 2, 3, 0]);
  });

  it('the sofa slides on tick 300 and goes back on 600 (2 states)', () => {
    const s = openRound([sofa()]);
    expect(firstChange(s, 299)).toBe(-1);
    expect(firstChange(s, 5)).toBe(300);
    expect(pair(s).state).toBe(1);
    expect(firstChange(s, 400)).toBe(600);
    expect(pair(s).state).toBe(0);
  });

  it('the fountain splashes on tick 480 and every 480 after', () => {
    const s = openRound([fountain()]);
    put(s, 0, 13, 6);
    tick(s, {}, 479);
    expect(s.match.live!.fountain!.last).toBeNull();
    tick(s, {}, 2);
    expect(s.match.live!.fountain!.last).toEqual({ tick: 480, team: 0 });
    tick(s, {}, 480);
    expect(s.match.live!.fountain!.last!.tick).toBe(960);
  });

  it('the phase from the seed shifts the schedule but the period stays: first change = period - offset, never inside the warning', () => {
    for (const phase of [0, 1, 250, 500, 999]) {
      const s = openRound([brush(4, 4, 0, phase), sofa(8, 9, 0, phase)]);
      const off = offsetOf('brush', phase);
      expect(off).toBeLessThan(BRUSH_TICKS - WARN_TICKS);
      expect(firstChange(s, 250)).toBe(BRUSH_TICKS - off);
      const first = BRUSH_TICKS - off;
      expect(first).toBeGreaterThan(WARN_TICKS);
      const second = firstChange(s, 250);
      expect(second).toBe(first + BRUSH_TICKS);
    }
  });

  it('1 s of warning before each change, and while it waits; both members change together (one state)', () => {
    const s = openRound([brush()]);
    const p = pair(s);
    expect(nextChange(p, 179, WARN_TICKS)).toEqual({ in: 61, warning: false });
    expect(nextChange(p, 180, WARN_TICKS)).toEqual({ in: 60, warning: true });
    expect(nextChange(p, 239, WARN_TICKS)).toEqual({ in: 1, warning: true });
    expect(nextChange(p, 240, WARN_TICKS)).toEqual({ in: 240, warning: false });
    expect(nextChange({ ...p, pending: true }, 100, WARN_TICKS).warning).toBe(true);
  });
});

describe('what the brush and the fountain paint', () => {
  it('a brush paints what it sweeps in the colour of the last team on its pivot; neutral paints nothing', () => {
    const neutral = openRound([brush()]);
    tick(neutral, {}, 241);
    expect(neutral.match.counts).toEqual([0, 0]);

    const s = openRound([brush()]);
    put(s, 0, 4, 4); // team 0 steps on the left pivot
    tick(s, {}, 2);
    expect(pair(s).owner).toEqual([0, -1]);
    put(s, 0, 4, 12);
    tick(s, {}, 239);
    expect(pair(s).state).toBe(1);
    const painted = (x: number, y: number) => s.match.paint[y * 27 + x];
    expect([painted(5, 4), painted(6, 4), painted(5, 5)]).toEqual([0, 0, 0]); // the old bar and the corner
    expect(painted(4, 5)).toBe(-1); // the new bar is furniture: not painted
    expect(s.match.counts).toEqual([3, 0]); // the right member has no owner: nothing
    put(s, 1, 22, 4); // team 1 takes the right pivot (mirror)
    tick(s, {}, 2);
    put(s, 1, 22, 12);
    expect(pair(s).owner).toEqual([0, 1]);
  });

  it('the last team to step on the pivot wins it', () => {
    const s = openRound([brush()]);
    put(s, 0, 4, 4);
    tick(s);
    put(s, 0, 4, 12);
    put(s, 1, 4, 4);
    tick(s);
    expect(pair(s).owner[0]).toBe(1);
  });

  it('the fountain: more bodies within 2 tiles paint the 12 tiles around it in their colour', () => {
    const s = openRound([fountain()], [0, 1, 0]);
    put(s, 0, 13, 6);
    put(s, 1, 14, 7);
    put(s, 2, 12, 8);
    tick(s, {}, 481);
    expect(s.match.counts).toEqual([12, 0]);
    expect(s.match.paint[7 * 27 + 13]).toBe(-1); // its own tile is not painted
    expect(s.match.paint[7 * 27 + 15]).toBe(0); // distance 2
    expect(s.match.paint[7 * 27 + 16]).toBe(-1); // distance 3
  });

  it('the fountain: a tie washes the 12 tiles clean; nobody near, nothing; a body at distance 3 does not count', () => {
    const tie = openRound([fountain()]);
    for (const [x, y] of [
      [13, 5],
      [13, 9],
      [11, 7],
      [15, 7],
    ] as const)
      paintTile(tie.match, x, y, 1, 0);
    put(tie, 0, 13, 6);
    put(tie, 1, 13, 8);
    tick(tie, {}, 481);
    expect(tie.match.counts).toEqual([0, 0]);
    expect(tie.match.live!.fountain!.last).toEqual({ tick: 480, team: -1 });

    const far = openRound([fountain()]);
    paintTile(far.match, 13, 5, 1, 0);
    put(far, 0, 13, 4); // distance 3
    put(far, 1, 20, 12);
    tick(far, {}, 481);
    expect(far.match.counts).toEqual([0, 1]);
    expect(far.match.live!.fountain!.last).toBeNull();
  });

  it('the fountain does not paint furniture', () => {
    const s = openRound([fountain()]);
    s.match.live!.base[7 * 27 + 14] = 1;
    s.grid.map.solid[7 * 27 + 14] = 1;
    put(s, 0, 13, 6);
    tick(s, {}, 481);
    expect(s.match.counts).toEqual([11, 0]);
  });
});
