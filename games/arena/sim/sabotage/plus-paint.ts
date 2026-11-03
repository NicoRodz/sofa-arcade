// The tape (F8a, and PR6's packing tape): a covered tile keeps its state. `paintTile` and `clearTile` (match/board.ts) are the only writers of the floor, so the rule sits there.
import { underTape } from '../wrap/tape';
import { TAPE_HALF } from './kinds';
import type { PlusState } from './plus';

/** Is the tile at (x, y), painted `old`, under a tape? F8a: a 3x3 that guards only paint of its own colour. PR6: a strip that guards the tile whatever it holds (neutral stays neutral). */
export const tapeLocks = (p: PlusState, x: number, y: number, old: number): boolean =>
  (p.wrap !== null && underTape(p.wrap, x, y)) ||
  (old >= 0 && p.tapes.some((t) => t.team === old && Math.abs(t.x - x) <= TAPE_HALF && Math.abs(t.y - y) <= TAPE_HALF));
