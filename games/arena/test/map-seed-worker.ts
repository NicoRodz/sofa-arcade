// Worker thread of map-seed-pool.ts: generates its share of the seeds, times each one and posts back one plain record (no maps: only what the test asserts on).
import { parentPort, workerData } from 'node:worker_threads';
import { generateMap, validateMap } from '../map';

export interface SeedRecord {
  seed: number;
  ms: number;
  fallback: boolean;
  attempts: number;
  violations: string[]; // V1-V7 ids that fail on the map the generator handed back (must be empty when it did not fall back)
}

if (parentPort) {
  const records: SeedRecord[] = [];
  for (const seed of workerData.seeds as number[]) {
    const t0 = performance.now();
    const g = generateMap(seed);
    const ms = performance.now() - t0;
    records.push({
      seed,
      ms,
      fallback: g.fallback,
      attempts: g.attempts,
      violations: g.fallback ? [] : validateMap(g.map).map((v) => v.id),
    });
  }
  parentPort.postMessage(records);
}
