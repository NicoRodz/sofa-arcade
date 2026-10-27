import type { MapDef } from '../../types';

// Carta larga, map 9 of the design (id 28): two half-kitchens with different stations, a wall between them with two H hatches and one doorway at the bottom. The tomato is on the left and
// the sauce pot on the right, like the cheese and the ham, so the Pizza de la casa crosses the hatches. The sink (L) is on the left half and the dirty-plate return (U) on the right.
export const MAP_28: MapDef = {
  id: '28',
  name: 'Cocina espejo',
  nMin: 5,
  nMax: 8,
  minDuro: 1,
  stars: 3,
  versusFit: { grade: 'C', s: 0.5, sigma: 'mirrorY', why: 'Serie Carta larga: solo coop.' },
  rows: [
    '#C1C2CK#CC4CKCR#',
    'O......#.......O',
    'O.S..S.H..S..S.O',
    'C......#.......C',
    '3......H.......5',
    'C......#.......C',
    'P.S..S...S...S.P',
    'X..............X',
    '##CLCCCECCCCUC##',
  ],
};
