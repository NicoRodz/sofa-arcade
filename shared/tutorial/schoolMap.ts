// The practice kitchen: one open hall, a counter line of everything on the top wall and the same one on the bottom wall, so even eight chefs find a free dough crate,
// tomato crate, board, oven and window. It is NOT in FIXED_MAPS (the lobby never lists it, no validator counts it): only the school builds it.
// Left to right on both walls: dough, tomato, boards, ovens, windows (the order of the four steps). 8 spawn tiles.
export const SCHOOL_MAP_ID = 'school';
export const SCHOOL_ROWS: readonly string[] = [
  '#11C22KKKCOOCEE#',
  '#..............#',
  '#..............#',
  '#..S..S..S..S..#',
  '#..............#',
  '#..S..S..S..S..#',
  '#..............#',
  '#..............#',
  '#11C22KKKCOOCEE#',
];
