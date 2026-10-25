import type { MapDef } from '../types';

export const MAP_3: MapDef = {
  id: '3',
  name: 'El río',
  nMin: 2,
  nMax: 4,
  minDuro: 2,
  stars: 2,
  versusFit: {
    grade: 'C',
    s: 0.88,
    sigma: 'mirrorY',
    why: 'Río cooperativo por diseño: una orilla prepara (masa, tomate, tabla) y la otra hornea y entrega; cada mitad es la mitad de la receta.',
  },
  puestos: [['prep'], ['horno', 'reparto'], ['prep'], ['horno', 'reparto']], // left bank prepares, right bank bakes and serves
  rows: [
    '##1C2CK~CCOCOC##',
    '#......~.......#',
    'K......C.......P',
    'C......~.......C',
    'C..S...C...S...E',
    'C......~.......C',
    'C..S...C...S...C',
    '#......~.......#',
    '##CCCCC~CCCCCC##',
  ],
};
