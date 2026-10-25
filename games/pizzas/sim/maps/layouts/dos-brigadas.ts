import type { MapDef } from '../types';

export const MAP_14: MapDef = {
  // Design spawns put the second Horno/Reparto of the 8-chef table far from their stations; they alternate top/bottom lane here
  // in the order of the puesto table: Masa, Corte, Horno, Reparto, Lavado, Queso, Horno 2, Reparto 2.
  id: '14',
  name: 'Dos brigadas',
  nMin: 6,
  nMax: 8,
  minDuro: 1,
  stars: 3,
  versusFit: {
    grade: 'C',
    s: 0.99,
    sigma: 'mirrorY',
    why: 'Casi simétrica arriba/abajo, pero hornos, lavaplatos y entrega están en la fila central que comparten; sin ellos cada mitad no hornea.',
  },
  spawns: [
    [2, 2],
    [5, 6],
    [10, 2],
    [13, 6],
    [2, 6],
    [5, 2],
    [10, 6],
    [13, 2],
  ],
  rows: [
    '##123#KK#CC##X##',
    '#..............#',
    '#.S..S....S..S.P',
    'U..............E',
    'L..COCOCCOCOC..E',
    'L..............E',
    '#.S..S....S..S.P',
    '#..............#',
    '##123#KK#CC##X##',
  ],
};
