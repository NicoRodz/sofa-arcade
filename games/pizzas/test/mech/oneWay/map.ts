// Test map of 'oneWay': two lanes side by side. The pizza goes east on row 4 (> only) and the chefs come back west on row 5 (< only), so nobody walks against the flow.
export const ONEWAY_ROWS: readonly string[] = [
  '################',
  '#1.2....K.P...E#',
  '#S..S..........#',
  '#..............#',
  '#...>>>>>>>>...#',
  '#...<<<<<<<<...#',
  '#...O......O...#',
  '#..............#',
  '################',
];
