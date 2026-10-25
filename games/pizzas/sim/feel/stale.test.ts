import { describe, expect, it } from 'vitest';
import { staleControls } from './stale';

const c = { x: 1, y: -0.5, a: 2, b: true, bTaps: 1 } as never;

describe('staleControls', () => {
  it('leaves fresh input alone', () => expect(staleControls(c, 100)).toBe(c));
  it('fades the stick between 150 and 300 ms and zeroes it after', () => {
    expect(staleControls(c, 225).x).toBeCloseTo(0.5);
    expect(staleControls(c, 225).y).toBeCloseTo(-0.25);
    expect(staleControls(c, 400).x).toBe(0);
  });
  it('keeps the held B for 300 ms, then lets go; never touches the presses', () => {
    expect(staleControls(c, 299).b).toBe(true);
    expect(staleControls(c, 301).b).toBe(false);
    expect(staleControls(c, 1000).a).toBe(2);
  });
});
