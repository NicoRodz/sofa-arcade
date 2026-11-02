// Helpers for the F4 event tests: a round with the events on (F0 map: its 3x3 free spot is on row 7, the big pinata lands on (13, 7)), a quiet program, painting by rectangle.
import { MAP_W, solidAt } from '../../map';
import { createManchazo, stepManchazo, type ManchazoInput, type ManchazoState } from '../../sim';
import { paintTile } from '../../sim/match/board';
import type { EventKind, Planned } from '../../sim';

export function evRound(seed = 3, teams: readonly number[] = [0, 1], mapSeed?: number): ManchazoState {
  return createManchazo({ slots: teams.map((_t, i) => i), teams, seed, events: true, ...(mapSeed ? { mapSeed } : {}) });
}
/** No scheduled event will start (the Hourglass, the come-back and the hidden scoreboard still check the round). */
export const quiet = (s: ManchazoState): ManchazoState => {
  s.match.ev!.next = s.match.ev!.program.length;
  return s;
};
/** The program is one event of `kind` starting at `at` (the other slots are removed). */
export function only(s: ManchazoState, kind: EventKind, at: number, extra: Partial<Planned> = {}): ManchazoState {
  const ev = s.match.ev!;
  const p = ev.program.find((q) => q.kind === kind) ?? ev.program[0]!;
  const q = { ...p, kind, at, ...extra };
  if (kind === 'rain' && q.order.length === 0)
    // the drawn program had no rain: a plain reading order over the band
    for (let y = q.row; y < q.row + 3; y++) for (let x = 0; x <= 13; x++) if (!solidAt(s.grid.map, x, y)) q.order.push(y * MAP_W + x);
  ev.program = [q];
  ev.next = 0;
  return s;
}
export const run = (s: ManchazoState, n: number, inputs: Record<number, ManchazoInput> = {}) => {
  for (let k = 0; k < n; k++) stepManchazo(s, new Map(Object.entries(inputs).map(([slot, v]) => [Number(slot), v])));
};
/** Paints the rectangle (floor only) for a team, as a pinata would. */
export function paintRect(s: ManchazoState, team: number, x0: number, y0: number, x1: number, y1: number) {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (!solidAt(s.grid.map, x, y)) paintTile(s.match, x, y, team, s.grid.tick);
}
/** The true count of painted tiles of a team, to compare with `match.counts` (golden weights aside). */
export const recount = (s: ManchazoState, team: number) => s.match.paint.reduce((n, v) => n + (v === team ? 1 : 0), 0);
export const left = (s: ManchazoState) => s.grid.durationTicks - s.grid.tick;
/** Puts the round `ticks` before its end (a multiple of 60 ticks away, so the once-a-second checks fall on it). */
export const untilEnd = (s: ManchazoState, ticks: number) => void (s.grid.tick = s.grid.durationTicks - ticks);
export { MAP_W };
/** Gives a team a lead of `tiles` painted tiles over the other (painted rows from the top, left half for team 0, right half for team 1). */
export function lead(s: ManchazoState, team: number, tiles: number) {
  let n = 0;
  for (let y = 0; y < 15 && n < tiles; y++)
    for (let x = 0; x < MAP_W && n < tiles; x++) {
      const px = team === 0 ? x : MAP_W - 1 - x;
      if (y >= 5 && y <= 9 && px > 8 && px < 18) continue; // keep the middle (the Hourglass's circle and the gold zone) unpainted
      if (!solidAt(s.grid.map, px, y) && s.match.paint[y * MAP_W + px]! < 0) paintTile(s.match, px, y, team, 0), n++;
    }
}

/** The biggest lead (in tiles) that is NOT over 15 % of the floor, and the next one that is: 14.9 % and 15.1 % on the F0 map. */
export function borders(paintable: number) {
  let lo = 0;
  while ((lo + 1) * 100 <= 15 * paintable) lo++;
  return { lo, hi: lo + 1 };
}
