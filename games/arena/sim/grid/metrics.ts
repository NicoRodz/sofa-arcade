// Failed-turn metric (F0 exit criterion): of the turns players asked for, how many the sim did not execute within 300 ms.
import { FAIL_TICKS } from './config';
import type { GridBody, GridState, TurnStats } from './state';

export const newRequest = (b: GridBody, dir: GridBody['dir']): void => {
  b.req = { dir, age: 0, failed: false };
  b.stats.requested++;
};

/** The request ended without being executed (stick released or changed). A request already counted as failed stays failed. */
export function cancelRequest(b: GridBody): void {
  if (b.req && !b.req.failed) b.stats.cancelled++;
  b.req = null;
}

export function executeRequest(b: GridBody): void {
  if (b.req && !b.req.failed) b.stats.executed++;
  b.req = null;
}

/** One tick of waiting: at 300 ms the request becomes a failed turn (once). */
export function ageRequest(b: GridBody): void {
  const r = b.req;
  if (!r) return;
  r.age++;
  if (!r.failed && r.age >= FAIL_TICKS) {
    r.failed = true;
    b.stats.failed++;
  }
}

export interface TurnReport extends TurnStats {
  open: number; // requests still waiting (neither executed, failed nor cancelled)
  failedRate: number; // failed / requested, 0 when nothing was requested
}

export function turnReport(s: GridState): TurnReport {
  const t: TurnReport = {
    requested: 0,
    executed: 0,
    failed: 0,
    cancelled: 0,
    open: 0,
    failedRate: 0,
  };
  for (const b of s.bodies) {
    t.requested += b.stats.requested;
    t.executed += b.stats.executed;
    t.failed += b.stats.failed;
    t.cancelled += b.stats.cancelled;
    if (b.req && !b.req.failed) t.open++;
  }
  t.failedRate = t.requested === 0 ? 0 : t.failed / t.requested;
  return t;
}
