import { availableParallelism } from 'node:os';
import { Worker } from 'node:worker_threads';
import type { SeedRecord } from './map-seed-worker';

// Threads for a batch: PG_TEST_WORKERS (a number or a percentage of the cores) when set, else half the cores; at most one per seed.
export function poolSize(total: number, env = process.env.PG_TEST_WORKERS): number {
  const cores = availableParallelism();
  const raw = env ? (env.endsWith('%') ? (cores * parseFloat(env)) / 100 : parseFloat(env)) : cores / 2;
  return Math.max(1, Math.min(total, Math.floor(Number.isFinite(raw) ? raw : cores / 2)));
}

function runBatch(seeds: number[]): Promise<SeedRecord[]> {
  // tsx lets the worker import the TypeScript sources (and the @pichi/* packages) as they are.
  const worker = new Worker(new URL('./map-seed-worker.ts', import.meta.url), { workerData: { seeds }, execArgv: ['--import', 'tsx'] });
  return new Promise((resolve, reject) => {
    worker.once('message', resolve);
    worker.once('error', reject);
    worker.once('exit', (code) => reject(new Error(`seed worker exited with code ${code} before answering`)));
  });
}

/** Generates every seed over worker threads (round robin); the records come back in seed order. A worker that dies rejects: the test goes red, not green. */
export async function generateAll(seeds: number[]): Promise<SeedRecord[]> {
  const n = poolSize(seeds.length);
  const shares: number[][] = Array.from({ length: n }, () => []);
  seeds.forEach((_, i) => shares[i % n]!.push(i));
  const batches = await Promise.all(shares.map((idx) => runBatch(idx.map((i) => seeds[i]!))));
  const records: SeedRecord[] = new Array(seeds.length);
  batches.forEach((b, w) => b.forEach((r, k) => (records[shares[w]![k]!] = r)));
  return records;
}
