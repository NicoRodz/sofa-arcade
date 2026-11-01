import { describe, expect, it } from 'vitest';
import { ArenaRun, OVER_BANNER_MS, STEP_MS } from '../screen/run';

describe('arena run (the phones feeding the sim)', () => {
  it('the first packet of a phone is a baseline, a grown presses counter is one push', () => {
    const r = new ArenaRun([0, 1], 3);
    const [a, b] = r.state.fighters;
    b!.x = a!.x + 60; // within push range
    b!.y = a!.y;
    r.receive(0, 0, 0, [5, 9]);
    r.advance(STEP_MS);
    expect(b!.vx).toBe(0); // a counter at 5 is not a press
    r.receive(0, 0, 0, [6, 9]);
    r.advance(STEP_MS);
    expect(Math.hypot(b!.vx, b!.vy)).toBeGreaterThan(500);
  });

  it('the stick of the last packet steers its fighter for as many steps as the frame holds', () => {
    const r = new ArenaRun([0, 1], 3);
    const x0 = r.state.fighters[0]!.x;
    r.receive(0, 1, 0, [0, 0]);
    r.advance(STEP_MS * 3);
    expect(r.state.t).toBeCloseTo(STEP_MS * 3, 6);
    expect(r.state.fighters[0]!.x).toBeGreaterThan(x0);
  });

  it('a stalled frame does not fast-forward the round', () => {
    const r = new ArenaRun([0, 1], 3);
    r.advance(10_000);
    expect(r.state.t).toBeLessThanOrEqual(STEP_MS * 6 + 1e-6);
  });

  it('announces the end of the winner banner exactly once', () => {
    const r = new ArenaRun([0, 1], 3);
    r.state.fighters[1]!.x = 9999;
    r.advance(STEP_MS * 2); // the second fighter falls, the round is over
    expect(r.state.over).toBe(true);
    const done = Array.from({ length: 20 }, () => r.advance(OVER_BANNER_MS / 10)).filter(Boolean);
    expect(done).toHaveLength(1);
  });
});
