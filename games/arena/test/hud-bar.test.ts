import { describe, expect, it } from 'vitest';
import { floorBar } from '../screen/match/hud-bar';
import { percentOf, type MatchState } from '../sim';

describe('the HUD floor bar matches the percent labels', () => {
  it('orange from the left and blue from the right by their share of the floor, grey in the middle', () => {
    const w = 1000;
    const bar = floorBar([100, 200], 400, w);
    expect(bar).toEqual({ orange: 250, blue: 500 });
    expect(w - bar.orange - bar.blue).toBe(250); // 25 % unpainted
  });

  it('shows the same shares as percentOf (not shares of the painted tiles only)', () => {
    const m = { counts: [40, 80], paintable: 400 } as unknown as MatchState;
    const w = 800;
    const bar = floorBar(m.counts, m.paintable, w);
    expect(percentOf(m, 0)).toBe(10);
    expect(percentOf(m, 1)).toBe(20);
    expect(bar.orange / w).toBeCloseTo(percentOf(m, 0) / 100, 10);
    expect(bar.blue / w).toBeCloseTo(percentOf(m, 1) / 100, 10);
  });

  it('empty floor draws nothing; a full floor never overflows the track', () => {
    expect(floorBar([0, 0], 400, 1000)).toEqual({ orange: 0, blue: 0 });
    expect(floorBar([0, 0], 0, 1000)).toEqual({ orange: 0, blue: 0 });
    const full = floorBar([300, 100], 400, 1000);
    expect(full.orange + full.blue).toBeLessThanOrEqual(1000);
  });
});
