import { describe, expect, it } from 'vitest';
import { InputTracker, quantizeStick } from './input';

describe('quantizeStick (plan §2)', () => {
  it('dead zone 0.2, half speed under 0.6, full above', () => {
    expect(quantizeStick(0.19)).toBe(0);
    expect(quantizeStick(-0.19)).toBe(0);
    expect(quantizeStick(0.2)).toBe(0.45);
    expect(quantizeStick(-0.59)).toBe(-0.45);
    expect(quantizeStick(0.6)).toBe(1);
    expect(quantizeStick(-1)).toBe(-1);
  });
});

describe('InputTracker', () => {
  const pkt = (x: number, presses: number[], y = 0) => ({ x, y, presses });
  it('the latest packet wins (absolute stick); the first sample of presses is a baseline', () => {
    const t = new InputTracker();
    t.receive(pkt(1, [5, 9]), 0);
    expect(t.step(0)).toMatchObject({ move: 1, jump: false, grab: false });
    t.receive(pkt(-1, [5, 9]), 16);
    expect(t.step(16).move).toBe(-1);
  });
  it('several A presses between steps are one jump', () => {
    const t = new InputTracker();
    t.receive(pkt(0, [0, 0]), 0);
    t.receive(pkt(0, [3, 0]), 16);
    expect(t.step(16).jump).toBe(true);
    expect(t.step(33).jump).toBe(false);
  });
  it('B presses become at most 2 toggles on consecutive steps', () => {
    const t = new InputTracker();
    t.receive(pkt(0, [0, 0]), 0);
    t.receive(pkt(0, [0, 5]), 16);
    expect([t.step(16).grab, t.step(33).grab, t.step(50).grab, t.step(66).grab]).toEqual([true, true, false, false]);
  });
  it('a press counter that wraps (mod 65536) still counts', () => {
    const t = new InputTracker();
    t.receive(pkt(0, [65535, 0]), 0);
    t.receive(pkt(0, [1, 0]), 16);
    expect(t.step(16).jump).toBe(true);
  });
  it('stale stick: full until 300 ms without packets, then decays to 0 over 150 ms', () => {
    const t = new InputTracker();
    t.receive(pkt(1, [0, 0]), 1000);
    expect(t.step(1300).move).toBe(1);
    expect(t.step(1375).move).toBe(0.45); // half decayed: 0.5 -> half-speed band
    expect(t.step(1450).move).toBe(0);
    expect(t.step(5000).move).toBe(0);
  });
  it('before any packet there is no movement; down and up come from y', () => {
    const t = new InputTracker();
    expect(t.step(0)).toMatchObject({ move: 0, down: false, up: false });
    t.receive(pkt(0, [0, 0], 0.9), 0);
    expect(t.step(1)).toMatchObject({ down: true, up: false });
    t.receive(pkt(0, [0, 0], -0.9), 2);
    expect(t.step(3)).toMatchObject({ down: false, up: true });
  });
});

describe('InputTracker: campaign signals (dynamic 1)', () => {
  const pkt = (sig?: { kind: 'wait' | 'go'; seq: number }, goHeld?: boolean) => ({ x: 0, y: 0, presses: [0, 0], signal: sig, goHeld });
  it('the first signal sample is a baseline; a new seq is one signal, delivered once', () => {
    const t = new InputTracker();
    t.receive(pkt({ kind: 'wait', seq: 7 }), 0);
    expect(t.step(0).signal).toBeUndefined(); // baseline: a phone that joins mid-counter signals nothing
    t.receive(pkt({ kind: 'go', seq: 8 }), 16);
    expect(t.step(16).signal).toBe('go');
    expect(t.step(33).signal).toBeUndefined();
    t.receive(pkt({ kind: 'go', seq: 8 }), 33); // same seq again (a repeated packet): nothing
    expect(t.step(33).signal).toBeUndefined();
  });
  it('goHeld is a state: it follows the latest packet', () => {
    const t = new InputTracker();
    t.receive(pkt(undefined, true), 0);
    expect(t.step(0).goHeld).toBe(true);
    t.receive(pkt(undefined, false), 16);
    expect(t.step(16).goHeld).toBeUndefined();
  });
  it('a quick-match packet (no signal fields) gives the same step as always', () => {
    const t = new InputTracker();
    t.receive({ x: 1, y: 0, presses: [0, 0] }, 0);
    expect(t.step(0)).toEqual({ move: 1, down: false, up: false, jump: false, grab: false });
  });
});
