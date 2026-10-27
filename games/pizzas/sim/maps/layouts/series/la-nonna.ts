import type { MapDef } from '../../types';

// Carta larga, map 5 of the design (id 25): the sauce pots sit in a pocket in the middle with four ways in.
export const MAP_25: MapDef = {
  id: '25',
  name: 'La nonna',
  nMin: 2,
  nMax: 5,
  minDuro: 1,
  stars: 2,
  versusFit: { grade: 'C', s: 0.5, sigma: 'mirrorY', why: 'Serie Carta larga: solo coop.' },
  rows: [
    '##1C2CK##KC3C4##',
    'C......##......O',
    'C.S.......S....O',
    'C...##.CC.##...C',
    'P...#..RR..#.S.O',
    'C...##.CC.##...C',
    'C.S........S...C',
    '5......##......X',
    '##CCCCC##CCCCE##',
  ],
};
