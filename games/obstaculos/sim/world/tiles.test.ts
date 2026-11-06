import { mulberry32 } from '@pichi/core';
import { describe, expect, it } from 'vitest';
import { TILE } from '../../constants';
import { T, isHazardKind, isSolidKind } from '../../legend';
import { parseLevelStrict } from '../../parse';
import type { LevelDef } from '../../types';
import { HAZARD_SHRINK, boxHitsHazard, boxHitsSolid, boxTouches, buildGrid, setTile, tileAt, tileOf } from './tiles';

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
  it('the table-driven queries answer like the predicate definition, on a grid of every kind, inside and outside it (and for NaN)', () => {
    const w = 9,
      h = 6;
    const grid = { w, h, cells: new Uint8Array(w * h) };
    const rng = mulberry32(7);
    for (let i = 0; i < grid.cells.length; i++) grid.cells[i] = Math.floor(rng() * 16);
    let solid = 0,
      hazard = 0;
    for (let n = 0; n < 4000; n++) {
      const x = (rng() * (w + 4) - 2) * TILE,
        y = (rng() * (h + 4) - 2) * TILE,
        bw = rng() * 80 + 1,
        bh = rng() * 80 + 1;
      const s = boxTouches(grid, x, y, bw, bh, isSolidKind);
      const hz = boxTouches(grid, x + HAZARD_SHRINK, y + HAZARD_SHRINK, bw - 2 * HAZARD_SHRINK, bh - 2 * HAZARD_SHRINK, isHazardKind);
      expect(boxHitsSolid(grid, x, y, bw, bh), `solid ${x} ${y} ${bw} ${bh}`).toBe(s);
      expect(boxHitsHazard(grid, x, y, bw, bh), `hazard ${x} ${y} ${bw} ${bh}`).toBe(hz);
      solid += s ? 1 : 0;
      hazard += hz ? 1 : 0;
    }
    expect(solid).toBeGreaterThan(500); // both answers occur: the comparison is not between two constants
    expect(solid).toBeLessThan(3500);
    expect(hazard).toBeGreaterThan(100);
    expect(hazard).toBeLessThan(3500);
    expect(boxHitsSolid(grid, Number.NaN, 0, 34, 46)).toBe(boxTouches(grid, Number.NaN, 0, 34, 46, isSolidKind));
  });
});
