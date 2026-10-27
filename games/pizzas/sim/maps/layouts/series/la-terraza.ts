import type { MapDef } from '../../types';

// Carta larga, map 2 of the design: two of the three ovens sit on an ice terrace behind a doorway (the basil crate of the design is a counter until the basil exists).
export const MAP_23: MapDef = {
  id: '23',
  name: 'La terraza',
  nMin: 2,
  nMax: 5,
  minDuro: 1,
  stars: 2,
  versusFit: { grade: 'C', s: 0.5, sigma: 'mirrorY', why: 'Serie Carta larga: solo coop.' },
  rows: [
    '#1C2CK3C#CCCC4C#',
    'C.S.....#iiiiiiO',
    'C.......#iiiiiiC',
    'K..CC...#iiiiiiO',
    'O..CC.......iiiC',
    'C..CC...#iiiiiiC',
    'P.S..S.S#iiiiiiC',
    'X....S..#iiiiiiC',
    '##ECCCCC#CCCCCC#',
  ],
};
