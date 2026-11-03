// One attempt of an archetype, not yet validated: the exits, the template's walls and kept floor, then the random fill up to the density the template asks for.
import type { Rng } from '@pichi/core';
import { MAP_H, MAP_W } from '../../layout';
import { emptyMap, mirrorTile, type TileMap } from '../../tile-map';
import { bandsOf, exitsOf, keepAround, quotaOf } from '../exits';
import { furnish } from '../furniture';
import { v1Connection } from '../validate-state';
import { islas } from './islas';
import type { Archetype, TemplateFn } from './kinds';
import { ocho } from './ocho';
import { pasillos } from './pasillos';
import { plaza } from './plaza';

const TRIES = 600;
const TEMPLATES: Readonly<Record<Archetype, TemplateFn>> = { pasillos, islas, plaza, ocho };

export function drawArchetype(kind: Archetype, rng: Rng): TileMap {
  const exits = exitsOf(rng);
  const m = emptyMap([exits, exits.map(mirrorTile)]);
  const tpl = TEMPLATES[kind](rng, exits);
  const keep = keepAround(exits, rng, tpl.lanes);
  const at = (x: number, y: number) => (x < 0 || x > (MAP_W - 1) / 2 || y < 0 || y >= MAP_H ? -1 : y * MAP_W + x);
  const { band, cells } = bandsOf(exits);
  const quota = quotaOf(cells, tpl.density);
  if (tpl.forceWalls) for (const [x, y] of tpl.walls) keep[at(x, y)] = 0;
  for (const [x, y] of tpl.keep) if (at(x, y) >= 0) keep[at(x, y)] = 1;
  for (const [x, y] of tpl.walls) {
    const i = at(x, y);
    if (i < 0 || keep[i] === 1) continue;
    m.solid[i] = 1;
    m.solid[mirrorTile([x, y])[1] * MAP_W + mirrorTile([x, y])[0]] = 1;
    if (band[i]! >= 0) quota[band[i]!] = Math.max(0, quota[band[i]!]! - 1);
  }
  furnish({ solid: m.solid, keep, band, quota, w: MAP_W, h: MAP_H, maxX: tpl.maxX, centre: 0 }, rng, () => v1Connection(m) === null, TRIES);
  return m;
}
