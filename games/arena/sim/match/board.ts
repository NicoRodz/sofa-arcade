// The paint on the floor: one team (or none) per tile, with a running count per team.
import { MAP_W } from '../../map';
import type { MatchState } from './state';

export const tileIndex = (x: number, y: number): number => y * MAP_W + x;

/** Paints a tile for a team. A gain stamps `reachedAt` (the tie-break: whoever reached the final count first). */
export function paintTile(m: MatchState, x: number, y: number, team: number, tick: number): void {
  const i = tileIndex(x, y);
  const old = m.paint[i]!;
  if (old === team) return;
  if (old >= 0) m.counts[old]!--;
  m.paint[i] = team;
  m.counts[team]!++;
  m.reachedAt[team] = tick;
}

/** Share of the floor a team has painted, in percent with one decimal (display only: the sim compares tile counts). */
export const percentOf = (m: MatchState, team: number): number => Math.round((1000 * m.counts[team]!) / m.paintable) / 10;

/** Erases a rival's paint (turpentine): the tile goes neutral. Not a gain, so no tie-break stamp. */
export function clearTile(m: MatchState, x: number, y: number, keep: number): void {
  const i = tileIndex(x, y);
  const old = m.paint[i]!;
  if (old < 0 || old === keep) return;
  m.counts[old]!--;
  m.paint[i] = -1;
}
