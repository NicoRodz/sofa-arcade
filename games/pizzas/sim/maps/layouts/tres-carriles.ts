import type { MapDef } from '../types';

export const MAP_11: MapDef = {
  // Design spawns (2,2) (12,6) (12,2) (2,6) (5,2) (9,6) (9,2) (5,6) put puesto 2 (Corte) far from the tomato and cheese crates:
  // reordered so spawn i is next to the stations of puesto i (Masa, Corte, Horno, Reparto, Apoyo, Queso, Horno 2, Reparto 2).
  id: '11',
  name: 'Tres carriles',
  nMin: 4,
  nMax: 8,
  minDuro: 1,
  stars: 2,
  versusFit: {
    grade: 'B',
    s: 1.0,
    sigma: 'mirrorY',
    half: 'top',
    derived: '11-vs',
    why: 'Simétrica arriba/abajo salvo la fila central, que une las cocinas; la mitad superior (filas 0-3) trae las seis estaciones, queso incluido, y cuatro inicios: sale `11-vs` con muro en la fila 4 y giro de 180°.',
  },
  spawns: [
    [2, 2],
    [5, 6],
    [5, 2],
    [12, 6],
    [12, 2],
    [2, 6],
    [9, 2],
    [9, 6],
  ],
  rows: [
    '##123##KK##CC#X#',
    '#..............#',
    '#.S..S...S..S..P',
    '#..CCOCC.CCOCC.E',
    'X..............E',
    '#..CCOCC.CCOCC.E',
    '#.S..S...S..S..P',
    '#..............#',
    '##123##KK##CC#X#',
  ],
};
