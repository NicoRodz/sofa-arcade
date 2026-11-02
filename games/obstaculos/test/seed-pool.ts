import { availableParallelism } from 'node:os';
import { Worker } from 'node:worker_threads';
import type { GenerateOpts } from '../generate/generate';
import type { JobBatch, JobRecord } from './seed-worker';

// Threads for a batch: PG_TEST_WORKERS (a number or a percentage of the cores) when set, else half the cores; at most one per seed.
export function poolSize(total: number, env = process.env.PG_TEST_WORKERS): number {
  const cores = availableParallelism();
  const raw = env ? (env.endsWith('%') ? (cores * parseFloat(env)) / 100 : parseFloat(env)) : cores / 2;
  return Math.max(1, Math.min(total, Math.floor(Number.isFinite(raw) ? raw : cores / 2)));
}

function runBatch(jobs: GenerateOpts[]): Promise<JobBatch> {
  // tsx lets the worker import the TypeScript sources (and the @pichi/* packages) as they are, and runs them faster than vitest's transform.
  const worker = new Worker(new URL('./seed-worker.ts', import.meta.url), { workerData: { jobs }, execArgv: ['--import', 'tsx'] });
  return new Promise((resolve, reject) => {
    worker.once('message', resolve);
    worker.once('error', reject);
    worker.once('exit', (code) => reject(new Error(`seed worker exited with code ${code} before answering`)));
  });
}

// Generates and revalidates every job over worker threads. The records come back in job order, the merged FALLBACK_LOG of all workers beside them.
export async function runJobs(jobs: GenerateOpts[]): Promise<{ records: JobRecord[]; fallbackLog: string[] }> {
  const n = poolSize(jobs.length);
  const shares: number[][] = Array.from({ length: n }, () => []); // job indexes per worker
  jobs.forEach((_, i) => shares[i % n]!.push(i)); // round robin: the hard seeds are not clustered in one worker
  const batches = await Promise.all(shares.map((idx) => runBatch(idx.map((i) => jobs[i]!))));
  const records: JobRecord[] = new Array(jobs.length);
  batches.forEach((b, w) => b.records.forEach((r, k) => (records[shares[w]![k]!] = r)));
  return { records, fallbackLog: batches.flatMap((b) => b.fallbackLog) };
}
