import type { MapDef } from '../types';

export const MAP_16: MapDef = {
  id: '16',
  name: 'Pista de hielo',
  nMin: 2,
  nMax: 4,
  minDuro: 1,
  stars: 2,
  versusFit: { grade: 'C', s: 0.9, sigma: 'mirrorY', why: 'Coop con superficies: el hielo del centro no existe en versus.' },
  rows: [
    '##C1C2CKCKCOCOC#',
    '#..............#',
    'C..iiiiiiiiii..C',
    'C..iiiiiiiiii..C',
    'P.SiiiiiiiiiiS.E',
    'C..iiiiiiiiii..C',
    'C.S.iiiiiiii.S.C',
    '#..............#',
    '##CCCCCCCCCCCC##',
  ],
};
