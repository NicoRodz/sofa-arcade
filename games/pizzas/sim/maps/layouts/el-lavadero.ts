import type { MapDef } from '../types';

export const MAP_10: MapDef = {
  id: '10',
  name: 'El lavadero',
  nMin: 4,
  nMax: 6,
  minDuro: 1,
  stars: 2,
  versusFit: {
    grade: 'C',
    s: 0.6,
    sigma: 'mirrorY',
    why: 'Lavado abajo, resto arriba y la entrega en el borde derecho: asimétrico, sin mitad completa.',
  },
  rows: [
    '#1#2#3##KK##OO##',
    '#..............#',
    '#.S...S...S....P',
    'X....CCCCC.....E',
    '#...........S..E',
    '##C#C#.#.......#',
    'U..S...#..S....X',
    'L......#.......#',
    '#L######CCKCC#P#',
  ],
};
