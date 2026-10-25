import type { MapDef } from '../types';

export const MAP_9: MapDef = {
  id: '9',
  name: 'La trattoria',
  nMin: 3,
  nMax: 5,
  minDuro: 1,
  stars: 2,
  versusFit: {
    grade: 'C',
    s: 0.83,
    sigma: 'mirrorY',
    why: 'Ingredientes a la izquierda, hornos a la derecha, tablas en la fila central.',
  },
  rows: [
    '##1#2#3####O#O##',
    '#..............#',
    '#.S.....S......#',
    '#..............P',
    'X...CKCKCKC.S..#',
    '#..............E',
    '#.S.....S......E',
    '#..............#',
    '#CCC######CCC#X#',
  ],
};
