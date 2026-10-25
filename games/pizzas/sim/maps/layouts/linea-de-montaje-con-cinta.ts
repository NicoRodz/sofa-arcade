import type { MapDef } from '../types';

export const MAP_19: MapDef = {
  id: '19',
  name: 'Línea de montaje con cinta',
  nMin: 2,
  nMax: 4,
  minDuro: 1,
  stars: 2,
  versusFit: { grade: 'C', s: 0.9, sigma: 'mirrorY', why: 'Coop con superficies: dos cintas de piso en sentidos contrarios.' },
  rows: [
    '##C1C2CKCKCOCOC#',
    '#.S..........S.#',
    'C→→→→→→→→→→→→→→C',
    'C..............C',
    'P.S..........S.E',
    'C..............C',
    'C←←←←←←←←←←←←←←C',
    '#..............#',
    '##CCCCCCCCCCCC##',
  ],
};
