// What the TV shows of the invisible ink (F8a): the paint without the hidden tiles and the marker without them. The sim never reads these.
import { MAP_W } from '../../map';
import { weightAt } from '../match/board';
import type { ManchazoState, MatchState } from '../match/state';

/** The paint the TV draws: what is hidden under a veil reads neutral. The real array when nothing is hidden (and always once the round is over). */
export function shownPaint(s: ManchazoState): Int8Array {
  const p = s.match.sab?.plus;
  if (!p || s.grid.over || !p.veiled.some((v) => v)) return s.match.paint;
  return s.match.paint.map((v, i) => (p.veiled[i] ? -1 : v));
}

/** The counts the marker shows: the sim's, minus the tiles still under a veil. */
export function shownCounts(s: ManchazoState): number[] {
  const m: MatchState = s.match;
  const p = m.sab?.plus;
  const out = [...m.counts];
  if (!p || s.grid.over) return out;
  p.veiled.forEach((v, i) => {
    if (v) out[m.paint[i]!]! -= weightAt(m, i % MAP_W, Math.floor(i / MAP_W));
  });
  return out;
}

/** Share of the floor a team shows, in percent with one decimal (display only). */
export const shownPercent = (s: ManchazoState, team: number): number => Math.round((1000 * shownCounts(s)[team]!) / s.match.paintable) / 10;
