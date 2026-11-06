import { describe, expect, it } from 'vitest';
import {
  BASE_CHECKS,
  MAP_H,
  MAP_W,
  STATE_CHECKS,
  emptyMap,
  generateMap,
  isValidMap,
  mapStates,
  v1Connection,
  v2Crossings,
  v3Exits,
  v4Equidistance,
  v5EvenArea,
  v6DeadEnds,
  v7Density,
  validateMap,
  type LivingElement,
  type TileMap,
} from '../map';

const wall = (m: TileMap, x: number, y: number) => {
  m.solid[y * MAP_W + x] = 1;
};
/** An open mirrored map with 4 exits per team (rows 1, 5, 9, 13); `edit` puts furniture on the left half and its mirror image. */
function open(edit: (put: (x: number, y: number) => void) => void = () => {}): TileMap {
  const exits = [1, 5, 9, 13].map((y) => [1, y] as const);
  const m = emptyMap([exits, exits.map(([x, y]) => [MAP_W - 1 - x, y] as const)]);
  edit((x, y) => (wall(m, x, y), wall(m, MAP_W - 1 - x, y)));
  return m;
}
/** A map that validates (a generated one), as a copy to damage. */
function fair(): TileMap {
  const g = generateMap(1, undefined, false, false);
  const m = { ...g.map, solid: g.map.solid.slice() };
  expect(g.fallback).toBe(false);
  expect(validateMap(m)).toEqual([]);
  return m;
}

describe('validators V1-V7: each is green on a fair map and red on its own defect', () => {
  it('V1 connection: a sealed pocket is a second component', () => {
    expect(v1Connection(fair())).toBeNull();
    const m = fair();
    const i = m.solid.findIndex(
      (v, k) => v === 0 && k % MAP_W > 4 && k % MAP_W < 12 && [1, -1, MAP_W, -MAP_W].every((d) => m.solid[k + d] === 0),
    );
    for (const d of [1, -1, MAP_W, -MAP_W]) m.solid[i + d] = 1;
    expect(v1Connection(m)).toBe('1 floor tiles cut off');
  });

  it('V2 crossings: fewer than 3 free tiles 2 rows apart in the centre column', () => {
    expect(v2Crossings(fair())).toBeNull();
    const m = open();
    for (let y = 0; y < MAP_H; y++) if (y !== 3 && y !== 4 && y !== 10) wall(m, 13, y);
    expect(v2Crossings(m)).toBe('2 crossings in the centre column'); // rows 3 and 4 count as one
  });

  it('V3 exits: an exit with fewer than 2 free directions', () => {
    expect(v3Exits(fair())).toBeNull();
    const m = open((put) => (put(1, 4), put(0, 5), put(2, 5)));
    expect(v3Exits(m)).toBe('team 0 exit (1,5) has 1 free direction(s)');
  });

  it('V4 equidistance: a team whose exits walk more than 2 steps apart to the centre', () => {
    expect(v4Equidistance(fair())).toBeNull();
    expect(v4Equidistance(open())).toBeNull();
    const m = open((put) => {
      for (let y = 1; y < MAP_H; y++) put(12, y); // the only way to the centre is row 0
    });
    expect(v4Equidistance(m)).toMatch(/^team 0 walks /);
  });

  it('V4 equidistance: both teams must walk the same (a team that must jog and the other that does not)', () => {
    const m = open();
    for (let y = 0; y < MAP_H; y++) if (![2, 6, 10, 14].includes(y)) wall(m, 14, y); // team 1 only: a gap one row off each exit
    expect(v4Equidistance(m)).toBe('teams walk 12,12,12,12 vs 13,13,13,13');
  });

  it('V5 even area: halves that paint a different number of tiles, or a region far from its team mean', () => {
    expect(v5EvenArea(fair())).toBeNull();
    const lopsided = fair();
    lopsided.solid[lopsided.solid.findIndex((v, k) => v === 0 && k % MAP_W === 6)] = 1;
    expect(v5EvenArea(lopsided)).toMatch(/^halves paint \d+ vs \d+$/);
    const squeezed = fair();
    for (let y = 9; y < MAP_H; y++)
      for (let x = 2; x < 12; x++)
        if (squeezed.solid[y * MAP_W + x] === 0 && y !== squeezed.spawns[0]![3]![1])
          (squeezed.solid[y * MAP_W + x] = 1), (squeezed.solid[y * MAP_W + MAP_W - 1 - x] = 1);
    expect(v5EvenArea(squeezed)).toMatch(/^team 0 regions /);
  });

  it('V6 dead ends: a corridor closed at one end longer than 3 tiles', () => {
    expect(v6DeadEnds(fair())).toBeNull();
    const closed = (from: number) =>
      open((put) => {
        for (let x = from; x <= 9; x++) put(x, 5), put(x, 7);
        put(9, 6);
      });
    expect(v6DeadEnds(closed(5))).toBe('dead end of more than 3 tiles at (8,6)'); // (8,6) (7,6) (6,6) (5,6)
    expect(v6DeadEnds(closed(6))).toBeNull(); // (8,6) (7,6) (6,6): 3 tiles is allowed
  });

  it('V7 density: under 18 % and over 24 % fail', () => {
    expect(v7Density(fair())).toBeNull();
    expect(v7Density(open())).toBe('density 0.0 %');
    const crowded = open((put) => {
      for (let y = 0; y < MAP_H; y++) for (let x = 0; x < 13; x++) if ((x + y) % 3 === 0) put(x, y);
    });
    expect(v7Density(crowded)).toMatch(/^density 3\d\.\d %$/);
  });
});

describe('the validators take any number of map states (F5: living elements)', () => {
  const sofa: LivingElement = {
    id: 'sofa',
    states: 2,
    closed: (s) =>
      s === 0
        ? []
        : [
            [3, 5],
            [3, 4],
            [3, 6],
            [3, 3],
            [3, 7],
          ],
  };

  it('no living elements: one state, the base map', () => {
    const base = fair();
    expect(mapStates(base, [])).toEqual([{ states: [], map: base }]);
  });

  it('enumerates every combination and closes the tiles of each state in a copy', () => {
    const base = fair();
    const pair: LivingElement = { id: 'brush', states: 3, closed: (s) => [[2 + s, 11]] };
    const all = mapStates(base, [sofa, pair]);
    expect(all.map((s) => s.states.join(''))).toEqual(['00', '01', '02', '10', '11', '12']);
    expect(all[5]!.map.solid[11 * MAP_W + 4]).toBe(1);
    expect(base.solid[11 * MAP_W + 4]).toBe(0);
  });

  it('a state that disconnects the map fails V1 only there, and says which combination', () => {
    const base = fair();
    const wide: LivingElement = {
      id: 'wall',
      states: 2,
      closed: (s) => (s === 0 ? [] : Array.from({ length: MAP_H }, (_, y) => [8, y] as const)),
    };
    expect(isValidMap(base, [sofa])).toBe(true);
    const bad = validateMap(base, [wide]);
    expect(bad).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'V1', states: [1] })]));
    expect(bad.some((v) => v.states?.[0] === 0)).toBe(false);
    expect(isValidMap(base, [wide])).toBe(false);
  });

  it('exposes V1-V3 as per-state checks and V4-V7 as base checks, in the plan numbering', () => {
    expect(STATE_CHECKS.map(([id]) => id).sort()).toEqual(['V1', 'V2', 'V3']);
    expect(BASE_CHECKS.map(([id]) => id).sort()).toEqual(['V4', 'V5', 'V6', 'V7']);
    expect(validateMap(generateMap(42).map)).toEqual([]);
  });
});
