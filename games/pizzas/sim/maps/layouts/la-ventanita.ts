import type { MapDef } from '../types';

export const MAP_6: MapDef = {
  id: '6',
  name: 'La ventanita',
  nMin: 2,
  nMax: 3,
  minDuro: 2,
  stars: 1,
  versusFit: {
    grade: 'C',
    s: 0.86,
    sigma: 'mirrorY',
    why: 'La mitad superior sí trae las seis estaciones, pero cada equipo necesitaría un chef por orilla (2 como mínimo) y la orilla derecha no tiene inicio en esa mitad.',
  },
  puestos: [['prep'], ['horno', 'reparto'], ['prep']],
  rows: [
    '##12#KK###O##EE#',
    '#......#.......#',
    '#..S...C.......P',
    '#......#.......#',
    'X......C...S...#',
    '#......#.......X',
    '#..S...C.......#',
    '#......#.......#',
    '#CCC############',
  ],
};
