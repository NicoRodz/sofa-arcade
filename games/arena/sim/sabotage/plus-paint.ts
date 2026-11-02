// The tape (F8a): a covered tile keeps its colour. `paintTile` and `clearTile` (match/board.ts) are the only writers of the floor, so the rule sits there.
import { TAPE_HALF } from './kinds';
import type { PlusState } from './plus';

/** Is the tile at (x, y), painted `old`, under a tape of that same colour? Then nobody repaints or erases it. */
export const tapeLocks = (p: PlusState, x: number, y: number, old: number): boolean =>
  old >= 0 && p.tapes.some((t) => t.team === old && Math.abs(t.x - x) <= TAPE_HALF && Math.abs(t.y - y) <= TAPE_HALF);
