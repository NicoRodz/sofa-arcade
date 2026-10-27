import type { MapDef } from '../../types';

// Carta larga, map 4 of the design: two wings with their own ovens, joined by one doorway in the middle; the basil crate of the design is a counter until the basil exists.
export const MAP_22: MapDef = {
  id: '22',
  name: 'Dos alas',
  nMin: 4,
  nMax: 8,
  minDuro: 1,
  stars: 3,
  versusFit: { grade: 'C', s: 0.5, sigma: 'mirrorX', why: 'Serie Carta larga: solo coop.' },
  rows: [
    '##CC1C2KK3C4CC##',
    'O..#........#..O',
    'O..#.S....S.#..O',
    'O.....CCCC.....O',
    'C..#.S.CC.S.#..C',
    'P..#........#..P',
    'C..#S.CCCC.S#..C',
    'X..#..S..S..#..X',
    '##CCCCCCECCCCC##',
  ],
};
