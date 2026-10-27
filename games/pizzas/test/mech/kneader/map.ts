// Test map of the kneader (not in the lobby): "Masa de muro", adapted so the wall around M is a spur (the kitchen stays one piece and eight chefs fit).
// The dough crate (1) is on the left, the boards (K) next to it, the ovens (O) on the right; M sits in the wall at column 7, its handles are (6, 4) and (8, 4).
export const KNEADER_ROWS: readonly string[] = [
  '################',
  '#1.K.....O.O..E#',
  '#2.K.........P.#',
  '#....S.#..S....#',
  '#3.....M......X#',
  '#.....S#.S.....#',
  '#..K.........P.#',
  '#.S..S.....S.S.#',
  '################',
];
export const KNEADER_HANDLES = [
  [6, 4],
  [8, 4],
] as const;
