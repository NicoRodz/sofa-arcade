import { describe, expect, it } from 'vitest';
import { LIVE_MS, createThrottle, type Clock } from './throttle';

function fake() {
  let t = 1000;
  const q: { at: number; fn: () => void; id: number }[] = [];
  let n = 0;
  const clock: Clock = {
    now: () => t,
    setTimeout: (fn, ms) => {
      q.push({ at: t + ms, fn, id: ++n });
      return n;
    },
    clearTimeout: (id) => {
      const i = q.findIndex((x) => x.id === id);
      if (i >= 0) q.splice(i, 1);
    },
  };
  const tick = (ms: number) => {
    t += ms;
    for (const x of q.filter((x) => x.at <= t).sort((a, b) => a.at - b.at)) {
      q.splice(q.indexOf(x), 1);
      x.fn();
    }
  };
  return { clock, tick, now: () => t };
}

describe('live throttle (300 ms)', () => {
  it('the first change goes out at once; a burst inside the window sends only the latest, at the window end', () => {
    const { clock, tick } = fake();
    const out: number[] = [];
    const th = createThrottle<number>((v) => out.push(v), LIVE_MS, clock);
    th.push(1);
    th.push(2);
    th.push(3);
    expect(out).toEqual([1]);
    tick(LIVE_MS - 1);
    expect(out).toEqual([1]);
    tick(1);
    expect(out).toEqual([1, 3]);
  });
  it('never closer than one window apart, however many changes, and the final state always arrives', () => {
    const { clock, tick, now } = fake();
    const out: { v: number; at: number }[] = [];
    const th = createThrottle<number>((v) => out.push({ v, at: now() }), LIVE_MS, clock);
    for (let i = 0; i < 100; i++) {
      th.push(i);
      tick(10);
    }
    tick(LIVE_MS);
    for (let i = 1; i < out.length; i++) expect(out[i]!.at - out[i - 1]!.at).toBeGreaterThanOrEqual(LIVE_MS);
    expect(out.at(-1)!.v).toBe(99);
  });
  it('Listo (now) goes out at once and drops what was waiting', () => {
    const { clock, tick } = fake();
    const out: string[] = [];
    const th = createThrottle<string>((v) => out.push(v), LIVE_MS, clock);
    th.push('a');
    th.push('b');
    th.now('done');
    tick(1000);
    expect(out).toEqual(['a', 'done']);
  });
  it('after a quiet window the next change is sent at once again', () => {
    const { clock, tick } = fake();
    const out: number[] = [];
    const th = createThrottle<number>((v) => out.push(v), LIVE_MS, clock);
    th.push(1);
    tick(LIVE_MS + 5);
    th.push(2);
    expect(out).toEqual([1, 2]);
  });
});
