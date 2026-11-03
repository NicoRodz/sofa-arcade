// Pasillos: the exits' rows are kept free end to end (a corridor each) and a wall bar with 1-2 gaps runs between two corridors; the fill adds the rest. The
// sliding sofas stand across the corridors as doors (see living-for.ts).
import type { Tile } from '../../tile-map';
import type { TemplateFn } from './kinds';

export const pasillos: TemplateFn = (rng, exits) => {
  const rows = exits.map(([, y]) => y);
  const keep: Tile[] = [];
  const walls: Tile[] = [];
  for (const y of rows) for (let x = 1; x <= 13; x++) keep.push([x, y]);
  for (let i = 0; i + 1 < rows.length; i++) {
    const y = Math.round((rows[i]! + rows[i + 1]!) / 2);
    const x0 = 2 + Math.floor(rng() * 2);
    const x1 = 11 + Math.floor(rng() * 2);
    const gaps = new Set<number>([x0 + 2 + Math.floor(rng() * (x1 - x0 - 3))]);
    if (rng() < 0.5) gaps.add(x0 + 2 + Math.floor(rng() * (x1 - x0 - 3)));
    for (let x = x0; x <= x1; x++) if (!gaps.has(x)) walls.push([x, y]);
  }
  return { walls, keep, lanes: false, forceWalls: false, maxX: 13, density: 0.17 + rng() * 0.02 };
};
