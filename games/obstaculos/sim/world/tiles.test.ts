import { describe, expect, it } from 'vitest';
import { TILE } from '../../constants';
import { T } from '../../legend';
import { parseLevelStrict } from '../../parse';
import type { LevelDef } from '../../types';
import { boxHitsHazard, boxHitsSolid, buildGrid, setTile, tileAt, tileOf } from './tiles';

const def: LevelDef = {
  id: 't',
  name: 't',
  biome: 'beach',
  players: { min: 2, max: 4 },
  tether: 'any',
  stars: 1,
  parSec: 30,
  rows: ['#######', '#S.%.G#', '#..^..#', '#######'],
};

describe('buildGrid', () => {
  it("'%' is solid in Libres and empty in Encadenados; the parsed tiles are not modified", () => {
    const p = parseLevelStrict(def);
    expect(tileAt(buildGrid(p, 'free'), 3, 1)).toBe(T.Solid);
    expect(tileAt(buildGrid(p, 'chain'), 3, 1)).toBe(T.Empty);
    expect(p.tiles[1 * p.w + 3]).toBe(T.FreeSolid);
  });
  it('outside the level: walls left and right, open sky above, void below', () => {
    const g = buildGrid(parseLevelStrict(def), 'chain');
    expect(tileAt(g, -1, 2)).toBe(T.Solid);
    expect(tileAt(g, g.w, 2)).toBe(T.Solid);
    expect(tileAt(g, 3, -1)).toBe(T.Empty);
    expect(tileAt(g, 3, g.h)).toBe(T.Empty);
  });
  it('setTile overlays a cell and ignores out-of-range writes', () => {
    const g = buildGrid(parseLevelStrict(def), 'chain');
    setTile(g, 2, 1, T.Door);
    expect(tileAt(g, 2, 1)).toBe(T.Door);
    setTile(g, 99, 1, T.Door);
    expect(g.cells).toHaveLength(7 * 4);
  });
});

describe('box queries', () => {
  const g = buildGrid(parseLevelStrict(def), 'chain');
  it('tileOf floors, also below zero', () => {
    expect(tileOf(47.9)).toBe(0);
    expect(tileOf(48)).toBe(1);
    expect(tileOf(-0.1)).toBe(-1);
  });
  it('a box flush against a solid does not touch it; one px in does', () => {
    expect(boxHitsSolid(g, TILE, TILE, 34, 46)).toBe(false); // inside the room, flush with the left wall
    expect(boxHitsSolid(g, TILE - 1, TILE, 34, 46)).toBe(true);
    expect(boxHitsSolid(g, TILE, 3 * TILE - 46, 34, 46)).toBe(false); // feet flush with the floor row
    expect(boxHitsSolid(g, TILE, 3 * TILE - 46 + 1, 34, 46)).toBe(true); // 1 px into the floor row
  });
  it('hazards need more than a graze (4 px shrink)', () => {
    const spikesX = 3 * TILE,
      spikesY = 2 * TILE;
    expect(boxHitsHazard(g, spikesX - 34 + 3, spikesY, 34, 46)).toBe(false); // 3 px of overlap
    expect(boxHitsHazard(g, spikesX - 34 + 6, spikesY, 34, 46)).toBe(true);
  });
});
