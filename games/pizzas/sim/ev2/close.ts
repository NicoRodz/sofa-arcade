// The close of an event with presence: the number (+/-) written to the score book with its source, and the event the TV card and the sounds read.
import type { Game } from '../round/state';
import type { EventKind } from '../midround';
import { book } from '../hazards/score-ledger';

/** The closing card of an event (TV: 2 s in the middle with the number; phones: a success or failure note). `ok` picks the tone. */
export function announce(g: Game, kind: EventKind, points: number, title: string, detail: string, ok: boolean, by?: number) {
  g.bus.emit('ev2:close', { kind, points, ok, title, detail, ...(by !== undefined ? { by } : {}) });
}

/** Add (or subtract, never below 0) `points` to the team's score with `source` in the book, and announce the card. */
export function award(
  g: Game,
  kind: EventKind,
  source: string,
  points: number,
  title: string,
  detail: string,
  ok = points > 0,
  by?: number,
) {
  const t = g.teams[0]!;
  const before = t.score;
  t.score = Math.max(0, t.score + points);
  if (t.score !== before) t.reachedAt = g.time;
  if (points > 0) t.gross += points;
  book(g, source, t.score - before);
  announce(g, kind, points, title, detail, ok, by);
}
