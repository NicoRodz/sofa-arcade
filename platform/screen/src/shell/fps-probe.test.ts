// F6: the p95 the fps goal is judged by. 95 % of the frames must be at least this fast.
import { describe, expect, it } from 'vitest';
import { fpsEnabled, summarize } from './fps-probe';

describe('summarize', () => {
  it('a steady 60 fps is 60 at every percentile and no slow frames', () => {
    const s = summarize(Array.from({ length: 600 }, () => 1000 / 60));
    expect(s.p95).toBeCloseTo(60, 5);
    expect(s.avg).toBeCloseTo(60, 5);
    expect(s.slow).toBe(0);
  });

  it('p95 is the frame time 95 % of the frames beat, not the average: 6 % of 33 ms frames drag it to 30 fps while the average stays above 58', () => {
    const ms = [...Array.from({ length: 94 }, () => 1000 / 60), ...Array.from({ length: 6 }, () => 1000 / 30)];
    const s = summarize(ms);
    expect(s.p95).toBeCloseTo(30, 5);
    expect(s.avg).toBeGreaterThan(55);
    expect(s.slow).toBe(6);
    expect(s.worstMs).toBeCloseTo(1000 / 30, 5);
  });

  it('5 % of slow frames still pass: the 95th frame is a fast one', () => {
    const ms = [...Array.from({ length: 95 }, () => 1000 / 60), ...Array.from({ length: 5 }, () => 1000 / 30)];
    expect(summarize(ms).p95).toBeCloseTo(60, 5);
  });

  it('no frames: zeros, not NaN', () => {
    expect(summarize([])).toEqual({ frames: 0, avg: 0, p95: 0, p99: 0, worstMs: 0, slow: 0 });
  });
});

describe('fpsEnabled', () => {
  it('only with ?fps=1', () => {
    expect(fpsEnabled('?fps=1')).toBe(true);
    expect(fpsEnabled('?room=A')).toBe(false);
    expect(fpsEnabled('?fps=0')).toBe(false);
  });
});
