// Worker thread of seed-pool.ts: generates and revalidates its share of the jobs and posts back one plain record per job.
import { parentPort, workerData } from 'node:worker_threads';
import { FALLBACK_LOG, generateLevel, type GenerateOpts } from '../generate/generate';
import { revalidate } from './revalidate';

export type Generated = ReturnType<typeof generateLevel>;
export interface JobRecord extends Generated {
  opts: GenerateOpts;
  errors: string[]; // revalidate() of the level the generator handed back
}
export interface JobBatch {
  records: JobRecord[];
  fallbackLog: string[];
}

if (parentPort) {
  FALLBACK_LOG.length = 0;
  const records: JobRecord[] = [];
  for (const opts of workerData.jobs as GenerateOpts[]) {
    const g = generateLevel(opts);
    records.push({ ...g, opts, errors: revalidate(opts, g.level.rows, g.level) });
  }
  const batch: JobBatch = { records, fallbackLog: [...FALLBACK_LOG] };
  parentPort.postMessage(batch);
}
