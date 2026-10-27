import type { MapDef } from '../types';

// Carta larga, map 1 (design pizzas-mapas-platos-diseno.md): two topping crates ('3' and '4'), the ovens far from the crates, a ring of counters in the middle.
export const MAP_20: MapDef = {
  id: '20',
  name: 'Doble cubierta',
  nMin: 2,
  nMax: 4,
  minDuro: 1,
  stars: 2,
  versusFit: { grade: 'C', s: 0.6, sigma: 'mirrorY', why: 'Serie Carta larga: solo coop.' },
  rows: [
    '#C1C2CKCCKCC3C##',
    '#..............O',
    'C..............O',
    'C...CCC..CCC...O',
    'C...C......C...C',
    'X...CCC..CCC...C',
    'P..S..S..S..S..C',
    '#..............#',
    '##ECCCCCCCCCC4##',
  ],
};
