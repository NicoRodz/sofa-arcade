// The score book (HAZARD_V3 instrument): every sum or subtraction on a team's score, with its source: `delivery`, `tip`, `event:*`, `penalty:*`, plus the counted losses of hazards (`hazard:*`, no points).
// A round keeps one only with `hazardsV3` or the `ledger` option; without it `book` is a no-op and the sim is untouched. Pure: no stream, no clock.
import type { Game } from './round/state';

export interface Ledger {
  points: Record<string, number>; // source -> net points (after the k of the handicap, as the score moves)
  count: Record<string, number>; // source -> how many entries
}
export const newLedger = (): Ledger => ({ points: {}, count: {} });

/** Write one entry. `points` may be 0 (a loss of an item that costs no score: it is only counted). */
export function book(g: Game, source: string, points: number): void {
  const l = g.ledger;
  if (!l) return;
  l.points[source] = (l.points[source] ?? 0) + points;
  l.count[source] = (l.count[source] ?? 0) + 1;
}

/** The sources of a ledger by family (`delivery`, `event`, `hazard`, `penalty`) with their net points. */
export function byFamily(l: Ledger): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(l.points)) {
    const f = k.split(':')[0]!;
    out[f] = (out[f] ?? 0) + v;
  }
  return out;
}
