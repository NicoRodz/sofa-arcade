import { describe, expect, it } from 'vitest';
import { DOUBLE_TAP_MS, ZOOM_EPSILON, createZoomGuard, isDoubleTap, isZoomed } from './zoom';

describe('double tap', () => {
  it('a touchend under 300 ms after the previous one is blocked, later ones are not', () => {
    expect(isDoubleTap(1000, 1000 + DOUBLE_TAP_MS - 1)).toBe(true);
    expect(isDoubleTap(1000, 1000 + DOUBLE_TAP_MS)).toBe(false);
    expect(isDoubleTap(0, Date.now())).toBe(false); // first tap of the session
  });
});

describe('zoom detection', () => {
  it('only a scale above the epsilon counts, missing viewport never does', () => {
    expect(isZoomed(1)).toBe(false);
    expect(isZoomed(ZOOM_EPSILON)).toBe(false);
    expect(isZoomed(1.5)).toBe(true);
    expect(isZoomed(undefined)).toBe(false);
    expect(isZoomed(null)).toBe(false);
  });
});

describe('zoom guard', () => {
  const setup = (scales: number[], attempts?: number) => {
    const vp = { scale: scales[0]! };
    const events: boolean[] = [];
    let resets = 0;
    const queue: (() => void)[] = [];
    const g = createZoomGuard({
      viewport: vp,
      attempts,
      reset: () => {
        resets++;
        vp.scale = scales[Math.min(resets, scales.length - 1)]!;
      },
      onZoomed: (z) => events.push(z),
      later: (fn) => queue.push(fn),
    });
    const flush = () => {
      while (queue.length) queue.shift()!();
    };
    return { g, vp, events, flush, resets: () => resets };
  };

  it('does nothing at scale 1', () => {
    const s = setup([1]);
    s.g.check();
    s.flush();
    expect(s.resets()).toBe(0);
    expect(s.events).toEqual([]);
  });
  it('recovers on its own: resets, rechecks, never shows the banner', () => {
    const s = setup([2.2, 1]);
    s.g.check();
    s.flush();
    expect(s.resets()).toBe(1);
    expect(s.events).toEqual([]);
  });
  it('shows the banner when resets do not work, after the attempts', () => {
    const s = setup([2.2, 2.2], 3);
    s.g.check();
    s.flush();
    expect(s.resets()).toBe(3);
    expect(s.events).toEqual([true]);
  });
  it('hides the banner once the scale is back, and the manual reset retries', () => {
    const s = setup([2.2, 2.2, 2.2, 2.2, 1], 3);
    s.g.check();
    s.flush();
    expect(s.events).toEqual([true]);
    s.g.manualReset();
    s.flush(); // 4th reset brings it to 1
    expect(s.events).toEqual([true, false]);
  });
  it('works without visualViewport', () => {
    const events: boolean[] = [];
    const g = createZoomGuard({
      viewport: null,
      reset: () => {
        throw new Error('no');
      },
      onZoomed: (z) => events.push(z),
      later: () => {},
    });
    g.check();
    expect(events).toEqual([]);
  });
});
