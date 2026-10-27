// Test map of 'mutation' (v2): at tick 300 the oven goes to the other side of the kitchen and the board and a crate trade places. The kitchen is valid before and after.
import type { MapDef } from '../../../sim/maps';

export const MUT_ROWS: readonly string[] = [
  '################',
  '#1.2....K.P...E#',
  '#S..S..........#',
  '#..............#',
  '#.O............#',
  '#..............#',
  '#..............#',
  '#..............#',
  '################',
];
export const MUT_OPS = [
  ['move', [2, 4], [12, 4]],
  ['swap', [8, 1], [3, 1]],
] as const;
export const MUT: NonNullable<MapDef['mutation']> = { at: 300, warn: 60, revertAt: 600, ops: MUT_OPS };
