// Worker thread of map-seed-pool.ts: generates its share of the seeds, times each one and posts back one plain record (no maps: only what the test asserts on).
import { parentPort, workerData } from 'node:worker_threads';
import { archetypeOf, elementsOf, generateMap, v8Signature, v9LivingConnection, validateMap, type MapKind } from '../map';

export interface SeedRecord {
  seed: number;
  ms: number;
  fallback: boolean;
  attempts: number;
  chosen: MapKind; // the archetype the seed asks for
  kind: MapKind; // what the generator handed back: the same, or 'clasico' when the archetype did not validate in 64 attempts
  violations: string[]; // V1-V7 (and V8, V9) ids that fail on the map the generator handed back (must be empty when it did not fall back)
}

const RETIME_ABOVE_MS = 3; // a slow reading is re-timed: the work is deterministic, so a preempted or GC-paused run is noise and the minimum is the cost
const RETIMES = 2;

if (parentPort) {
  const records: SeedRecord[] = [];
  for (const seed of workerData.seeds as number[]) {
    const t0 = performance.now();
    const g = generateMap(seed, undefined, true);
    let ms = performance.now() - t0;
    for (let r = 0; r < RETIMES && ms > RETIME_ABOVE_MS; r++) {
      const t1 = performance.now();
      generateMap(seed, undefined, true);
      ms = Math.min(ms, performance.now() - t1);
    }
    records.push({
      seed,
      ms,
      fallback: g.fallback,
      attempts: g.attempts,
      chosen: archetypeOf(seed),
      kind: g.archetype,
      violations: g.fallback
        ? []
        : [
            ...validateMap(g.map, elementsOf(g.living)).map((v) => v.id),
            ...(g.archetype !== 'clasico' && v8Signature(g.archetype, g.map) !== null ? ['V8'] : []),
            ...(v9LivingConnection(g.map, elementsOf(g.living)) !== null ? ['V9'] : []),
          ],
    });
  }
  parentPort.postMessage(records);
}
