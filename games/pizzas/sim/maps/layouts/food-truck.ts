import type { MapDef } from '../types';

export const MAP_7: MapDef = {
  id: '7',
  name: 'Food truck',
  nMin: 2,
  nMax: 3,
  minDuro: 1,
  stars: 2,
  versusFit: {
    grade: 'C',
    s: 0.89,
    sigma: 'mirrorX',
    why: 'Una sola cocina de dos filas entre dos muros de estaciones: ni la mitad superior (sin entrega, que está en el muro inferior) ni la inferior (sin masa ni tomate) tienen la receta completa.',
  },
  rows: [
    '################',
    '################',
    '##12CKKCCOCPCX##',
    '##S..........S##',
    '##......S.....##',
    '##CCCCOCCEECCC##',
    '################',
    '################',
    '################',
  ],
};
