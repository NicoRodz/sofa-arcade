import type { MapDef } from '../types';

export const MAP_15: MapDef = {
  id: '15',
  name: 'El sótano',
  nMin: 3,
  nMax: 6,
  minDuro: 1,
  stars: 3,
  versusFit: {
    grade: 'C',
    s: 0.74,
    sigma: 'mirrorY',
    why: 'Tres salas en cadena (preparar, hornear, entregar): ninguna mitad tiene la receta.',
  },
  spawns: [
    [2, 2],
    [8, 2],
    [2, 6],
    [12, 6],
    [5, 1],
    [12, 1],
  ],
  rows: [
    '#1#2#3###K#K##X#',
    '#....S.#....S..#',
    '#.S.....S......#',
    'X......#.......C',
    '###.#C###C#.####',
    '#......#.......E',
    'O.S.........S..E',
    'O......#.......P',
    '#CCC#X######CC##',
  ],
};
