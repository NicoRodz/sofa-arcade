import { describe, expect, it } from 'vitest';
import { createLastWins } from '../../../platform/server/src/appearance-guard';

const rig = (max = 5) => {
  let t = 0;
  const timers: { at: number; fn: () => void }[] = [];
  const got: number[] = [];
  const g = createLastWins<number>(
    (n) => got.push(n),
    max,
    1000,
    () => t,
    (fn, ms) => timers.push({ at: t + ms, fn }),
  );
  const advance = (ms: number) => {
    t += ms;
    for (const x of timers.filter((x) => x.at <= t)) {
      timers.splice(timers.indexOf(x), 1);
      x.fn();
    }
  };
  return { g, got, advance, timers };
};

describe('appearance last-wins pace guard', () => {
  it('lets 5 through at once, holds the rest and applies only the last when the window ends', () => {
    const { g, got, advance } = rig();
    for (let i = 1; i <= 20; i++) g.push(i);
    expect(got).toEqual([1, 2, 3, 4, 5]);
    advance(999);
    expect(got).toHaveLength(5);
    advance(1);
    expect(got).toEqual([1, 2, 3, 4, 5, 20]);
  });
  it('a new window lets messages through again; dispose cancels a pending one', () => {
    const { g, got, advance } = rig();
    for (let i = 1; i <= 7; i++) g.push(i);
    g.dispose();
    advance(2000);
    expect(got).toEqual([1, 2, 3, 4, 5]);
    const r = rig();
    for (let i = 1; i <= 5; i++) r.g.push(i);
    r.advance(1000);
    r.g.push(6);
    expect(r.got).toEqual([1, 2, 3, 4, 5, 6]);
  });
  it('arms one timer for a whole burst', () => {
    const { g, timers } = rig();
    for (let i = 0; i < 50; i++) g.push(i);
    expect(timers).toHaveLength(1);
  });
});
