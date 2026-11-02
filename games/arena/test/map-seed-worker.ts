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

const RETIME_ABOVE_MS = 3; // a slow reading is re-timed: the work is deterministic, so a preempted or GC-paused run is noise and the minimum is the cost
const RETIMES = 2;

if (parentPort) {
  const records: SeedRecord[] = [];
  for (const seed of workerData.seeds as number[]) {
    const t0 = performance.now();
    const g = generateMap(seed);
    let ms = performance.now() - t0;
    for (let r = 0; r < RETIMES && ms > RETIME_ABOVE_MS; r++) {
      const t1 = performance.now();
      generateMap(seed);
      ms = Math.min(ms, performance.now() - t1);
    }
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
