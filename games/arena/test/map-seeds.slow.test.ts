import { beforeAll, describe, expect, it } from 'vitest';
import { ARCHETYPES, SEED_SPACE, archetypeOf, type Archetype } from '../map';
import { generateAll } from './map-seed-pool';
import type { SeedRecord } from './map-seed-worker';

// The map generator's exit criterion: 10,000 seeds of EACH archetype, every one valid (V1-V7, the signature V8 and V9 with the living map placed), fewer than
// 1 % falling back (to Clasico or to the F0 map), p99 of the time per seed under 15 ms. Validity is deterministic and always asserted. Time is not: on a quiet
// machine the budget is 15 ms; when PG_TEST_WORKERS caps the run (a shared Mac, nice, other agents) the budget is 4x and the numbers are always logged.
const PER_KIND = 10_000;
const BUDGET_MS = process.env.PG_TEST_WORKERS ? 60 : 15;
// seeds spread over the whole 25-bit space (a stride coprime with 2^25), taken until every archetype has PER_KIND of them
const SEEDS: number[] = [];
const taken: Record<Archetype, number> = { pasillos: 0, islas: 0, plaza: 0, ocho: 0 };
for (let i = 0; ARCHETYPES.some((k) => taken[k] < PER_KIND); i++) {
  const seed = (i * 3359 + 17) % SEED_SPACE;
  const k = archetypeOf(seed);
  if (taken[k] < PER_KIND) (SEEDS.push(seed), taken[k]++);
}

describe('map generator over 10000 seeds of each archetype', () => {
  let records: SeedRecord[];
  beforeAll(async () => {
    records = await generateAll(SEEDS);
  }, 600_000);

  it('every seed gives a valid map (V1-V9) of its archetype, and under 1 % fall back', () => {
    expect(records).toHaveLength(SEEDS.length);
    expect(records.map((r) => r.seed)).toEqual(SEEDS);
    expect(records.filter((r) => r.violations.length)).toEqual([]);
    for (const k of ARCHETYPES) {
      const mine = records.filter((r) => r.chosen === k);
      expect(mine).toHaveLength(PER_KIND);
      const back = mine.filter((r) => r.kind !== k || r.fallback).length / PER_KIND;
      console.log(`map-seeds: ${k} falls back ${(back * 100).toFixed(2)} %`);
      expect(back).toBeLessThan(0.01);
    }
  });

  it('the first 10000 seeds of the stride split evenly between the archetypes (25 +- 3 %)', () => {
    const first = Array.from({ length: 10_000 }, (_, i) => archetypeOf((i * 3359 + 17) % SEED_SPACE));
    for (const k of ARCHETYPES) expect(Math.abs(first.filter((a) => a === k).length / first.length - 0.25)).toBeLessThan(0.03);
  });

  it('p99 of the time per seed is within budget for each archetype (15 ms; 60 ms when PG_TEST_WORKERS caps the run)', () => {
    for (const k of ARCHETYPES) {
      const ms = records
        .filter((r) => r.chosen === k)
        .map((r) => r.ms)
        .sort((a, b) => a - b);
      const p99 = ms[Math.floor(ms.length * 0.99)]!;
      console.log(`map-seeds: ${k} p50 ${ms[ms.length / 2]!.toFixed(2)} ms, p99 ${p99.toFixed(2)} ms, max ${ms[ms.length - 1]!.toFixed(2)} ms, budget ${BUDGET_MS} ms`);
      expect(p99).toBeLessThan(BUDGET_MS);
    }
  });
});
