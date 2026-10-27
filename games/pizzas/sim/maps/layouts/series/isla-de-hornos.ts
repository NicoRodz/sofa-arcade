import type { MapDef } from '../../types';

// Carta larga, map 8 of the design (id 27): four ovens on an island in the middle, so the pizzas cross the kitchen to bake. The dirty-plate return (U) is on the far right and the
// sink (L) on the bottom wall: the plates cross the kitchen too. The card: Pizza de la casa, the stuffed calzone, the Marinara de la nonna (ham on crate 4, the sauce pot on the left).
export const MAP_27: MapDef = {
  id: '27',
  name: 'Isla de hornos',
  nMin: 4,
  nMax: 8,
  minDuro: 1,
  stars: 3,
  versusFit: { grade: 'C', s: 0.5, sigma: 'mirrorY', why: 'Serie Carta larga: solo coop.' },
  rows: [
    '##C1C2CK#KC3C4##',
    'R.......#......5',
    'C.S..S.....S.S.C',
    'C.##..OCCO..##.C',
    'P.....CCCC.....E',
    'C.##..OCCO..##.C',
    'C.S..S.....S.S.C',
    'C.......#......U',
    '##CCCLCC#CCCCX##',
  ],
};
