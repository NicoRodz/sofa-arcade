import type { MapDef } from '../types';

export const MAP_13: MapDef = {
  id: '13',
  name: 'Tres cuartos',
  nMin: 5,
  nMax: 8,
  minDuro: 3,
  stars: 3,
  versusFit: {
    grade: 'C',
    s: 0.74,
    sigma: 'mirrorY',
    why: 'Tres salas con funciones repartidas (preparar, hornear, servir y lavar): la mitad superior solo carece de platos (están en la fila 8) y aun con ellos cada equipo necesitaría 3 chefs (minDuro 3).',
  },
  spawns: [
    [2, 2],
    [8, 2],
    [13, 2],
    [4, 2],
    [4, 4],
    [8, 4],
    [2, 4],
    [13, 5],
  ],
  puestos: [['masa'], ['horno', 'platos'], ['entrega', 'lavado'], ['corte'], ['queso'], ['horno', 'platos'], ['prep'], ['lavado']], // room A prepares (4), B bakes and plates (2), C serves and washes (2)
  rows: [
    '#123KK##CC##EUE#',
    '#.....C....C...#',
    '#.S.S.O.S..#.S.L',
    'X.....C....C...#',
    '#.S.S.O.S..#...L',
    '#.....C....C.S.#',
    '#.....O....#...#',
    '#.....C....C...X',
    '#KKCCC##PPX#####',
  ],
};
