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
  it('reset makes the next sample a baseline', () => {
    const t = new PressTracker();
    t.update([10]);
    t.reset();
    expect(t.update([12])).toEqual([0]);
    expect(t.update([13])).toEqual([1]);
  });
  it('keeps counting across a reconnect: taps made while offline arrive with the next packet', () => {
    const t = new PressTracker();
    t.update([5]);
    expect(t.update([8])).toEqual([3]);
  });
  it('a restarted phone counter (back to 0) is not read as a huge burst', () => {
    const t = new PressTracker();
    t.update([17]);
    expect(t.update([0])).toEqual([0]);
    expect(t.update([2])).toEqual([2]);
  });
});
