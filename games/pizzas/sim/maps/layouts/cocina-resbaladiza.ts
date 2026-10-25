import type { MapDef } from '../types';

export const MAP_18: MapDef = {
  id: '18',
  name: 'Cocina resbaladiza',
  nMin: 2,
  nMax: 4,
  minDuro: 1,
  stars: 3,
  versusFit: { grade: 'C', s: 0.9, sigma: 'mirrorY', why: 'Coop con superficies: todo el piso es hielo salvo los puntos de partida.' },
  rows: [
    '##C1C2CKCKCOCOC#',
    '#iiiiiiiiiiiiii#',
    'CiiiiiiiiiiiiiiC',
    'CiiiiiiiiiiiiiiC',
    'P.SiiiiiiiiiiS.E',
    'CiiiiiiiiiiiiiiC',
    'C.SiiiiiiiiiiS.C',
    '#iiiiiiiiiiiiii#',
    '##CCCCCCCCCCCC##',
  ],
};
