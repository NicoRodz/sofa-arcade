import type { MapDef } from '../types';

export const MAP_5: MapDef = {
  id: '5',
  name: 'Cinta',
  nMin: 3,
  nMax: 6,
  minDuro: 2,
  stars: 2,
  versusFit: {
    grade: 'C',
    s: 0.92,
    sigma: 'mirrorY',
    why: 'Río con cinta: preparación en una orilla, horno en la otra, y el pase central es la mitad del flujo.',
  },
  puestos: [['prep'], ['horno', 'platos'], ['entrega'], ['horno', 'platos'], ['prep'], ['horno', 'platos']], // delivery is on the preparation bank
  rows: [
    '##1C2CK~COCOCP##',
    '#......~.......#',
    'C..S...C...S...C',
    'C......~.......C',
    'E..S...~...S...C',
    'C......~.......C',
    'C..S...C...S...C',
    '#......~.......#',
    '##CCCCC~CCCCCC##',
  ],
};
