import { describe, expect, it } from 'vitest';
import { MAX_VOICES, VoiceLimiter, capFor } from './mixer';
import type { Cue } from './recipes';

const jump = (p: number): Cue => ({ recipe: 'jump', key: `jump:${p}`, priority: 2, p: { freq: 440 } });
const c = (recipe: Cue['recipe'], key: string, priority: Cue['priority']): Cue => ({ recipe, key, priority, p: {} });

describe('VoiceLimiter', () => {
  it('lets 8 players jump in the same instant and refuses a 9th jump', () => {
    const l = new VoiceLimiter();
    expect([0, 1, 2, 3, 4, 5, 6, 7].map((p) => l.allow(jump(p), 1))).toEqual(Array(8).fill(true));
    expect(l.allow(jump(8), 1)).toBe(false);
  });
  it('drops a repeat of the same key inside 40 ms only', () => {
    const l = new VoiceLimiter();
    expect(l.allow(jump(0), 1)).toBe(true);
    expect(l.allow(jump(0), 1.03)).toBe(false);
    expect(l.allow(jump(0), 1.05)).toBe(true);
  });
  it('never holds more than 24 voices; low priorities give way earlier than high ones', () => {
    expect(MAX_VOICES).toBe(24);
    expect([capFor(3), capFor(2), capFor(1), capFor(0)]).toEqual([24, 21, 18, 15]);
    const l = new VoiceLimiter();
    let n = 0;
    for (let i = 0; i < 40; i++) if (l.allow(c(i % 2 ? 'death' : 'bubble', `k${i}`, 3), 5)) n++;
    expect(n).toBe(16); // death x8 and bubble x8 (per-recipe cap) ... 
    expect(l.size).toBeLessThanOrEqual(24);
    const m = new VoiceLimiter();
    const recipes = ['land', 'grabBox', 'plate', 'gate', 'throw', 'ropeTaut', 'star'] as const;
    let low = 0;
    for (let i = 0; i < 60; i++) if (m.allow(c(recipes[i % 7]!, `x${i}`, 0), 3)) low++;
    expect(low).toBe(15);
    expect(m.allow(c('death', 'd', 3), 3)).toBe(true); // a death still gets through a crowded mix
  });
  it('frees voices when their sounds end', () => {
    const l = new VoiceLimiter();
    for (let p = 0; p < 8; p++) l.allow(jump(p), 1);
    expect(l.size).toBe(8);
    expect(l.allow(jump(8), 2)).toBe(true);
    expect(l.size).toBe(1);
  });
  it('continuous rope strain is throttled per rope', () => {
    const l = new VoiceLimiter();
    const s = c('ropeStrain', 'strain:0', 1);
    expect([1, 1.1, 1.2, 1.31].map((t) => l.allow(s, t))).toEqual([true, false, false, true]);
  });
});
