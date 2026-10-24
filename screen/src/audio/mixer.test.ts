import { describe, expect, it } from 'vitest';
import { CEILING, DUCK_GAIN, KNEE, LoopTable, MASTER_GAIN, SfxLimiter, hintText, masterGain, rateFor, softClip } from './mixer';

describe('mute and hint', () => {
  it('mute zeroes the master and unmute restores 0.9', () => {
    expect(masterGain(true)).toBe(0);
    expect(masterGain(false)).toBe(MASTER_GAIN);
  });
  it('hint asks for a click until the context runs, then only reports mute', () => {
    expect(hintText({ running: false, muted: false })).toBe('Haz clic para activar el sonido');
    expect(hintText({ running: false, muted: true })).toBe('Haz clic para activar el sonido');
    expect(hintText({ running: true, muted: false })).toBe('');
    expect(hintText({ running: true, muted: true })).toContain('silenciado');
  });
  it('duck is -6 dB', () => expect(20 * Math.log10(DUCK_GAIN)).toBeCloseTo(-6));
});

describe('pitch variation', () => {
  it('stays within +-8% for repetitive sounds and is 1 for the rest', () => {
    expect(rateFor('pickup', 0)).toBeCloseTo(0.92);
    expect(rateFor('pickup', 1)).toBeCloseTo(1.08);
    expect(rateFor('pickup', 0.5)).toBeCloseTo(1);
    expect(rateFor('deliver', 0)).toBe(1);
  });
});

describe('SfxLimiter', () => {
  it('drops a duplicate inside 40 ms and allows it after', () => {
    const l = new SfxLimiter();
    expect(l.allow('pickup', 1)).toBe(true);
    expect(l.allow('pickup', 1.03)).toBe(false);
    expect(l.allow('pickup', 1.05)).toBe(true);
  });
  it('allows at most 3 simultaneous instances of one sound', () => {
    const l = new SfxLimiter();
    expect([0, 0.1, 0.2, 0.3].map((t) => l.allow('deliver', t))).toEqual([true, true, true, false]);
    expect(l.allow('deliver', 1.5)).toBe(true); // the first ones have ended (1.2 s)
  });
  it('different sounds do not limit each other', () => {
    const l = new SfxLimiter();
    expect(l.allow('pickup', 1)).toBe(true);
    expect(l.allow('drop', 1.001)).toBe(true);
  });
});

describe('LoopTable', () => {
  const rand = () => 0.5;
  it('chop hits every 250 ms inside the lookahead window', () => {
    const t = new LoopTable();
    t.start('chop:1', 'chop', 10);
    const hits = t.due(10, 1, rand).map((h) => h.at);
    expect(hits).toEqual([10, 10.25, 10.5, 10.75]);
    expect(t.due(10.1, 1, rand).map((h) => h.at)).toEqual([11]);
  });
  it('stop removes the stream and a duplicate start is ignored', () => {
    const t = new LoopTable();
    expect(t.start('chop:1', 'chop', 0)).toBe(true);
    expect(t.start('chop:1', 'chop', 0)).toBe(false);
    t.stop('chop:1');
    expect(t.due(0, 1, rand)).toEqual([]);
  });
  it('at most 3 ovens crackle at once', () => {
    const t = new LoopTable();
    expect([1, 2, 3, 4].map((n) => t.start(`oven:${n}`, 'oven', 0))).toEqual([true, true, true, false]);
    t.stop('oven:1');
    expect(t.start('oven:4', 'oven', 0)).toBe(true);
  });
  it('never schedules in the past after a stall', () => {
    const t = new LoopTable();
    t.start('chop:1', 'chop', 0);
    expect(t.due(5, 0.1, rand)[0]!.at).toBe(5);
  });
  it('stopLoops clears everything', () => {
    const t = new LoopTable();
    t.apply({ kind: 'loopStart', key: 'a', loop: 'chop' }, 0);
    t.apply({ kind: 'loopStart', key: 'b', loop: 'oven' }, 0);
    t.apply({ kind: 'stopLoops' }, 0);
    expect(t.size).toBe(0);
  });
});

describe('softClip safety stage', () => {
  it('is transparent below the knee and never reaches 1 above it', () => {
    for (const x of [0, 0.3, -0.5, KNEE, -KNEE]) expect(softClip(x)).toBe(x);
    for (const x of [0.9, 1, 1.6, 4, 100, -1.6, -100]) expect(Math.abs(softClip(x))).toBeLessThan(1);
    expect(softClip(100)).toBeCloseTo(CEILING, 3);
  });
  it('is monotonic and odd', () => {
    let prev = -Infinity;
    for (let x = -3; x <= 3; x += 0.01) { const y = softClip(x); expect(y).toBeGreaterThanOrEqual(prev); prev = y; }
    expect(softClip(-1.3)).toBe(-softClip(1.3));
  });
});
