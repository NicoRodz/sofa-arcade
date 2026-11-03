// Ocho: in each half a solid block (3-5 wide, 3-4 tall) leans on the centre line with a free ring around it; the two rings share the centre column, so the
// map has a figure eight in the middle.
import type { Tile } from '../../tile-map';
import type { TemplateFn } from './kinds';

export const ocho: TemplateFn = (rng) => {
  const w = 3 + Math.floor(rng() * 3);
  const h = 3 + (rng() < 0.4 ? 1 : 0);
  const y0 = 5 + Math.floor(rng() * (4 - (h - 3)));
  const x0 = 13 - w;
  const walls: Tile[] = [];
  const keep: Tile[] = [];
  for (let y = y0 - 1; y <= y0 + h; y++)
    for (let x = x0 - 1; x <= 13; x++) (x >= x0 && x <= 12 && y >= y0 && y < y0 + h ? walls : keep).push([x, y]);
  return { walls, keep, lanes: true, forceWalls: true, maxX: 13, density: 0.18 + rng() * 0.02 };
};
