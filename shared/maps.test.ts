import { describe, expect, it } from 'vitest';
import { DIFFICULTIES } from './difficulty';
import { FIXED_MAPS, MAPS_BY_DIFFICULTY, MAP_H, MAP_W, fixedMap, isFloor, parseMap, pickFixedMap, spawnPoints } from './maps';

describe('fixed maps', () => {
  it('are five 16x9 grids with known characters only', () => {
    expect(FIXED_MAPS.map((m) => m.id)).toEqual(['1', '2', '3', '4', '5']);
    for (const m of FIXED_MAPS) {
      expect(m.rows.length, m.name).toBe(MAP_H);
      for (const r of m.rows) expect(r, m.name).toMatch(new RegExp(`^[#.S~C12KOPE]{${MAP_W}}$`));
      expect(() => parseMap(m.rows)).not.toThrow();
    }
  });

  it('the parser rejects a wrong size or an unknown tile', () => {
    expect(() => parseMap(FIXED_MAPS[0]!.rows.slice(1))).toThrow(/rows/);
    expect(() => parseMap(FIXED_MAPS[0]!.rows.map((r, i) => (i === 1 ? r.slice(1) : r)))).toThrow(/columns/);
    expect(() => parseMap(FIXED_MAPS[0]!.rows.map((r, i) => (i === 1 ? '#>............#.'.slice(0, 16) : r)))).toThrow(/unknown tile/);
  });

  it('every difficulty only lists existing maps', () => {
    for (const d of DIFFICULTIES) for (const id of MAPS_BY_DIFFICULTY[d]) expect(fixedMap(id)).toBeDefined();
  });

  it('"auto" picks from the difficulty list; a fixed id is kept', () => {
    expect(pickFixedMap('auto', 'hard', () => 0).id).toBe('4');
    expect(pickFixedMap('auto', 'hard', () => 0.99).id).toBe('5');
    expect(pickFixedMap('auto', 'easy', () => 0.6).id).toBe('2');
    expect(pickFixedMap('3', 'easy', () => 0).id).toBe('3');
  });
});

describe('spawnPoints', () => {
  it('starts with the S tiles in reading order; the river maps alternate sides', () => {
    const g = parseMap(fixedMap('3')!.rows);
    expect(spawnPoints(g, 4)).toEqual([[3, 4], [11, 4], [3, 6], [11, 6]]);
  });

  it('8 players get 8 distinct floor tiles; extras sit next to a spawn', () => {
    for (const m of FIXED_MAPS) {
      const g = parseMap(m.rows);
      const pts = spawnPoints(g, 8);
      expect(new Set(pts.map(([x, y]) => `${x},${y}`)).size, m.name).toBe(8);
      for (const [x, y] of pts) expect(isFloor(g, x, y)).toBe(true);
    }
    const g = parseMap(fixedMap('3')!.rows);
    const extra = spawnPoints(g, 6).slice(4); // 5th and 6th: one on each side again
    expect(extra.map(([x]) => x < 7)).toEqual([true, false]);
  });

  it('with one S tile, extras fan out by BFS distance and never repeat a tile', () => {
    const rows = FIXED_MAPS[0]!.rows.map((r) => r.replace(/S/g, '.'));
    rows[4] = rows[4]!.replace('.', 'S').replace(/^P/, 'P'); // first floor of row 4 becomes the only spawn
    const g = parseMap(rows);
    const pts = spawnPoints(g, 5);
    expect(new Set(pts.map(([x, y]) => `${x},${y}`)).size).toBe(5);
    const [sx, sy] = pts[0]!;
    for (const [x, y] of pts.slice(1)) expect(Math.abs(x - sx) + Math.abs(y - sy)).toBeLessThanOrEqual(2);
  });
});
