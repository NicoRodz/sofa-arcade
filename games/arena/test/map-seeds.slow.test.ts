import { describe, expect, it } from 'vitest';
import { SEED_SPACE } from '../map';
import { generateAll } from './map-seed-pool';

// F2's exit criterion: 10,000 seeds, every one valid (V1-V7) or the fallback, fewer than 1 % fallbacks, p99 of the time per seed under 15 ms.
const N = 10_000;
// seeds spread over the whole 25-bit space (a stride coprime with 2^25), not 0..9999
const SEEDS = Array.from({ length: N }, (_, i) => (i * 3359 + 17) % SEED_SPACE);

describe('map generator over 10000 seeds', () => {
  it('every seed gives a valid map, under 1 % fall back and p99 is under 15 ms', async () => {
    const records = await generateAll(SEEDS);
    expect(records).toHaveLength(N);
    expect(records.map((r) => r.seed)).toEqual(SEEDS);
    expect(records.filter((r) => r.violations.length)).toEqual([]);
    const fallbacks = records.filter((r) => r.fallback).length;
    const ms = records.map((r) => r.ms).sort((a, b) => a - b);
    const p99 = ms[Math.floor(N * 0.99)]!;
    console.log(
      `map-seeds: ${fallbacks} fallbacks of ${N}, p50 ${ms[N / 2]!.toFixed(2)} ms, p99 ${p99.toFixed(2)} ms, max ${ms[N - 1]!.toFixed(2)} ms`,
    );
    expect(fallbacks / N).toBeLessThan(0.01);
    expect(p99).toBeLessThan(15);
  });
});
