import { describe, expect, it } from 'vitest';
import { karplusStrong } from './ks';

const rms = (a: Float32Array, from: number, to: number) => { let s = 0; for (let i = from; i < to; i++) s += a[i]! * a[i]!; return Math.sqrt(s / (to - from)); };
describe('karplusStrong', () => {
  const sr = 44100;
  it('is finite, bounded by 1, deterministic per seed', () => {
    const a = karplusStrong(165, 0.985, 0.5, sr, 7);
    expect(a.every((x) => Number.isFinite(x) && Math.abs(x) <= 1)).toBe(true);
    expect(Array.from(karplusStrong(165, 0.985, 0.1, sr, 7))).toEqual(Array.from(karplusStrong(165, 0.985, 0.1, sr, 7)));
    expect(Array.from(karplusStrong(165, 0.985, 0.1, sr, 8))).not.toEqual(Array.from(karplusStrong(165, 0.985, 0.1, sr, 7)));
  });
  it('rings with the period of the pitch and decays', () => {
    const a = karplusStrong(220, 0.985, 0.5, sr, 3);
    expect(rms(a, 0, 2000)).toBeGreaterThan(0.05);
    expect(rms(a, sr * 0.4, sr * 0.5)).toBeLessThan(rms(a, 0, 2000) * 0.5);
    const hi = karplusStrong(220, 1, 0.5, sr, 3);
    const lo = karplusStrong(220, 0.9, 0.5, sr, 3);
    expect(rms(lo, sr * 0.3, sr * 0.4)).toBeLessThan(rms(hi, sr * 0.3, sr * 0.4)); // feedback sets the decay
  });
});
