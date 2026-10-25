import type { MapDef } from '../types';

export const MAP_2: MapDef = {
  id: '2',
  name: 'Isla central',
  nMin: 2,
  nMax: 5,
  minDuro: 1,
  stars: 1,
  versusFit: {
    grade: 'C',
    s: 0.88,
    sigma: 'mirrorX',
    why: 'Tomate, hornos y entrega están en la columna o fila central; ninguna mitad tiene las seis estaciones.',
  },
  rows: [
    '##CCCKCCKCCCCC##',
    '#..............#',
    '1..............O',
    'C...CCCCCCC....C',
    '2...CCCCCCC....O',
    'C..............C',
    'P..S.S..S.S.S..C',
    '#..............#',
    '##CCCCCCCCCCCE##',
  ],
};
