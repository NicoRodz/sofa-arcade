// Test map of 'gate' (not in the lobby): the kitchen up top, the ovens in a cellar behind two doors D; the plate Z sits beside the K so the porter chops while he holds the door.
export const GATE_ROWS: readonly string[] = [
  '################',
  '#1.2....K.P...E#',
  '#S..S...Z.S..S.#',
  '#..............#',
  '####D#######D###',
  '#..............#',
  '#.O.........O..#',
  '#..............#',
  '################',
];
// The same with no plate (the doors run on the clock) and an oven in the kitchen, so it can be played with the doors shut.
export const GATE_TIMER_ROWS: readonly string[] = GATE_ROWS.map((r, y) => (y === 3 ? '#.............O#' : r.replace('Z', '.')));
