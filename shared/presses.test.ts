import { describe, expect, it } from 'vitest';
import { PRESS_MOD, PressTracker, pressDelta } from './protocol';

describe('press counter', () => {
  it('counts presses that happened between two packets', () => {
    const t = new PressTracker();
    expect(t.update([0])).toEqual([0]);
    expect(t.update([3])).toEqual([3]); // 3 taps, 2 packets lost in between
    expect(t.update([3])).toEqual([0]); // repeated state, no new presses
    expect(t.update([4])).toEqual([1]);
  });
  it('handles counter wraparound', () => {
    expect(pressDelta(PRESS_MOD - 1, 1)).toBe(2);
  });
  it('reset forgets history (rejoin with counter back at 0)', () => {
    const t = new PressTracker();
    t.update([10]);
    t.reset();
    expect(t.update([1])).toEqual([1]);
  });
});
