import type { MapDef } from '../types';

export const MAP_8: MapDef = {
  id: '8',
  name: 'Espejo',
  nMin: 2,
  nMax: 4,
  minDuro: 2,
  stars: 1,
  versusFit: {
    grade: 'C',
    s: 0.82,
    sigma: 'mirrorY',
    why: 'No es espejo aprovechable: la izquierda tiene masa y la derecha tomate, y hornos, entrega y platos están en la columna central que usan ambos lados. La versión versus de Espejo es V1.',
  },
  rows: [
    '#11#KK###KK#22##',
    '#......C......##',
    '#.S....O....S.##',
    'X......C......X#',
    '#......E......##',
    '#......C......##',
    '#.S....O....S.##',
    '#......P......##',
    '#CCC#######CCC##',
  ],
};
