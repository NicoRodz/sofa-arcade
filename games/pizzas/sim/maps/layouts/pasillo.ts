import type { MapDef } from '../types';

export const MAP_4: MapDef = {
  id: '4',
  name: 'Pasillo',
  nMin: 2,
  nMax: 4,
  minDuro: 1,
  stars: 2,
  versusFit: {
    grade: 'C',
    s: 0.9,
    sigma: 'mirrorX',
    why: 'Dos orillas unidas por un pasillo: masa y tabla a la izquierda, hornos y platos a la derecha; la entrega queda en la fila central.',
  },
  rows: [
    '#1C2CK####COCOC#',
    '#.....####.....#',
    'K.....####.....P',
    'C.....####.....C',
    'E.S..........S.C',
    'C.....####.....C',
    'C.S...####...S.C',
    '#.....####.....#',
    '##CCCC####CCCC##',
  ],
};
