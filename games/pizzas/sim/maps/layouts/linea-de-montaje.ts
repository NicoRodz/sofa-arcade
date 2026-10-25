import type { MapDef } from '../types';

export const MAP_12: MapDef = {
  // Design order ends (7,6) (3,6) (11,6); (11,6) moves to 7th so "Horno 2" sits under the ovens of bay C.
  id: '12',
  name: 'Línea de montaje',
  nMin: 5,
  nMax: 8,
  minDuro: 1,
  stars: 2,
  versusFit: {
    grade: 'C',
    s: 0.56,
    sigma: 'mirrorY',
    why: 'Cuatro bahías en serie: una mitad no alcanza a cerrar la receta con menos de 4 chefs por equipo.',
  },
  spawns: [
    [2, 2],
    [6, 2],
    [10, 2],
    [14, 2],
    [13, 7],
    [7, 6],
    [11, 6],
    [3, 6],
  ],
  rows: [
    '#11K#23K#OOO#PP#',
    '#...#...#...#..#',
    '#.S.C.S.C.S.C.SE',
    'X...K...K...C..E',
    '#...C...C...C..#',
    '#...#...#...#..#',
    '#..S...S...S...U',
    '#............S.L',
    '#CCC#CCC#CCC#L##',
  ],
};
