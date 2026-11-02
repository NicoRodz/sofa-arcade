// The paint on the floor: one team (or none) per tile, with a running count per team.
import { MAP_W } from '../../map';
import { GOLD_FACTOR } from '../events/config';
import { tapeLocks } from '../sabotage/plus-paint';
import type { MatchState } from './state';

export const tileIndex = (x: number, y: number): number => y * MAP_W + x;

/** What a tile is worth in `counts`: 1, or GOLD_FACTOR inside the golden zone while that event runs. */
export const weightAt = (m: MatchState, x: number, y: number): number =>
  m.zone && x >= m.zone.x0 && x <= m.zone.x1 && y >= m.zone.y0 && y <= m.zone.y1 ? GOLD_FACTOR : 1;

/** Paints a tile for a team. A gain stamps `reachedAt` (the tie-break: whoever reached the final count first). */
export function paintTile(m: MatchState, x: number, y: number, team: number, tick: number): void {
  const i = tileIndex(x, y);
  const old = m.paint[i]!;
  if (old === team) return;
  const plus = m.sab?.plus;
  if (plus && tapeLocks(plus, x, y, old)) return; // F8a: a tape keeps its colour
  const w = weightAt(m, x, y);
  if (old >= 0) m.counts[old]! -= w;
  m.paint[i] = team;
  if (plus) plus.veiled[i] = plus.veil[team]! > 0 ? 1 : 0; // F8a: paint put down under an invisible ink stays hidden until the ink runs out
  m.counts[team]! += w;
  m.reachedAt[team] = tick;
}

/** Share of the floor a team has painted, in percent with one decimal (display only: the sim compares tile counts). */
export const percentOf = (m: MatchState, team: number): number => Math.round((1000 * m.counts[team]!) / m.paintable) / 10;

/** Erases a rival's paint (turpentine): the tile goes neutral. Not a gain, so no tie-break stamp. */
export function clearTile(m: MatchState, x: number, y: number, keep: number): void {
  const i = tileIndex(x, y);
  const old = m.paint[i]!;
  if (old < 0 || old === keep) return;
  const plus = m.sab?.plus;
  if (plus && tapeLocks(plus, x, y, old)) return;
  m.counts[old]! -= weightAt(m, x, y);
  m.paint[i] = -1;
  if (plus) plus.veiled[i] = 0;
}
