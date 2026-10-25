import type { MapDef } from '../types';

export const MAP_1: MapDef = {
  id: '1',
  name: 'Cocina abierta',
  nMin: 2,
  nMax: 4,
  minDuro: 1,
  stars: 1,
  versusFit: {
    grade: 'C',
    s: 0.9,
    sigma: 'mirrorY',
    why: 'Todas las estaciones corren por el muro superior y los extremos: la mitad izquierda no tiene tabla, horno ni entrega, la superior no tiene platos ni entrega (están en la fila central).',
  },
  rows: [
    '##C1C2CKCKCOCOC#',
    '#..............#',
    'C..............C',
    'C..............C',
    'P...S.S.S.S....E',
    'C..............C',
    'C..............C',
    '#..............#',
    '##CCCCCCCCCCCC##',
  ],
};
