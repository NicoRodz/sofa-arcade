import type { MapDef } from '../../types';

// Carta larga, map 6 of the design (id 26): a wall with no door splits the kitchen. Preparation on the left, ovens and delivery on the right; the three H hatches are
// the only way across (items cross, chefs do not). The spawns alternate left and right, so every N from 2 has a chef on each side.
export const MAP_26: MapDef = {
  id: '26',
  name: 'Pasaplatos',
  nMin: 2,
  nMax: 4,
  minDuro: 2,
  stars: 3,
  puestos: [['masa', 'corte'], ['horno', 'reparto'], ['prep'], ['horno', 'reparto']], // spawns alternate sides: left prepares, right bakes and serves
  versusFit: { grade: 'C', s: 0.5, sigma: 'mirrorY', why: 'Serie Carta larga: solo coop.' },
  rows: [
    '#C1C2CK#CCOOCCC#',
    '3......#.......O',
    'C......H.......O',
    'K..S...#...S...C',
    'R......H.......P',
    'C..S...#...S...C',
    '4......H.......5',
    'C......#.......X',
    '##CCKCC#CCCCCE##',
  ],
};
