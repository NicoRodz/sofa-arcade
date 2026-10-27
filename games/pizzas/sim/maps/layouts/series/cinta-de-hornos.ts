import type { MapDef } from '../../types';

// Carta larga, map 3 of the design: a fast belt lane towards four ovens, the way back on the outside. Ham on crate 3, mushroom on crate 4.
export const MAP_21: MapDef = {
  id: '21',
  name: 'Cinta de hornos',
  nMin: 3,
  nMax: 6,
  minDuro: 1,
  stars: 2,
  versusFit: { grade: 'C', s: 0.5, sigma: 'mirrorY', why: 'Serie Carta larga: solo coop.' },
  rows: [
    '#1C2CKCKC3CC4C##',
    'C..............O',
    'C.S..S..S..S...O',
    'C.CCCCCCCCCC...O',
    'P.→→→→→→→→→→→..O',
    'C.CCCCCCCCCC...C',
    'E..S.....S.....C',
    'X..............C',
    '##CCCCCCCCCCCC##',
  ],
};
