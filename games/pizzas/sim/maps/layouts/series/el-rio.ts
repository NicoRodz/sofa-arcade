import type { MapDef } from '../../types';

// Carta larga, map 7 of the design: a river splits the kitchen in two; the crossings are two pass-through counters and an ice bridge. The pot ('R') of the design is a counter until it exists.
export const MAP_24: MapDef = {
  id: '24',
  name: 'El río',
  nMin: 4,
  nMax: 8,
  minDuro: 1,
  stars: 3,
  versusFit: { grade: 'C', s: 0.5, sigma: 'mirrorY', why: 'Serie Carta larga: solo coop.' },
  rows: [
    '##C1C2CKCKC3C4##',
    'C..............C',
    'C.S..S....S..S.C',
    'C..............C',
    '~~~C~~~ii~~~C~~~',
    'O..............O',
    'O.S..S....S..S.O',
    'P..............O',
    '##CCC5CECCCCCX##',
  ],
};
