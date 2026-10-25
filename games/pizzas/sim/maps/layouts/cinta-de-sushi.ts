import type { MapDef } from '../types';

export const MAP_17: MapDef = {
  id: '17',
  name: 'Cinta de sushi',
  nMin: 2,
  nMax: 4,
  minDuro: 1,
  stars: 2,
  versusFit: { grade: 'C', s: 0.9, sigma: 'mirrorY', why: 'Coop con superficies: la cinta circular del centro no existe en versus.' },
  rows: [
    '##C1C2CKCKCOCOC#',
    '#.S..........S.#',
    'C..............C',
    'C...→→→→→→→↓...C',
    'P..S↑......↓..SE',
    'C...↑←←←←←←←...C',
    'C..............C',
    '#..............#',
    '##CCCCCCCCCCCC##',
  ],
};
