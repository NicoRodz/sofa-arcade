import { describe, expect, it } from 'vitest';
import { DIFFICULTIES } from '@pichi/core/difficulty';
import {
  FIXED_MAPS,
  MAPS_BY_DIFFICULTY,
  MAP_H,
  MAP_W,
  defaultMap,
  fixedMap,
  isFloor,
  lobbyMaps,
  lobbyN,
  mapStatus,
  parseMap,
  pickFixedMap,
  recommendedMaps,
  replacementMap,
  spawnPoints,
} from './maps';

describe('fixed maps', () => {
  it('are 16x9 grids with known characters only, ids unique and ascending', () => {
    const ids = FIXED_MAPS.map((m) => Number(m.id));
    expect(ids).toEqual([...new Set(ids)].sort((a, b) => a - b));
    for (const m of FIXED_MAPS) {
      expect(m.rows.length, m.name).toBe(MAP_H);
      for (const r of m.rows) expect(r, m.name).toMatch(new RegExp(`^[#.S~C123KOPEXUL]{${MAP_W}}$`));
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
    expect(pickFixedMap('auto', 'hard', () => 0.99).id).toBe('19');
    expect(pickFixedMap('auto', 'easy', () => 0.6).id).toBe('2');
    expect(pickFixedMap('3', 'easy', () => 0).id).toBe('3');
  });
});

describe('spawnPoints', () => {
  it('starts with the S tiles in reading order; the river maps alternate sides', () => {
    const g = parseMap(fixedMap('3')!.rows);
    expect(spawnPoints(g, 4)).toEqual([
      [3, 4],
      [11, 4],
      [3, 6],
      [11, 6],
    ]);
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

describe('lobby: map status by connected players', () => {
  const base = FIXED_MAPS.slice(0, 5); // the five original maps: the ranking is pinned on these so new maps do not move it
  const st = (id: string, n: number) => mapStatus(fixedMap(id)!, n);
  it('recommended inside nMin..nMax, warned between minDuro and nMin, blocked outside', () => {
    expect(st('1', 3).state).toBe('recommended');
    expect(st('5', 2)).toEqual({ state: 'warn', reason: 'pensado para 3+' });
    expect(st('3', 1)).toEqual({ state: 'blocked', reason: 'necesita 2+ jugadores' });
    expect(st('1', 1)).toEqual({ state: 'warn', reason: 'pensado para 2+' });
    expect(st('1', 5)).toEqual({ state: 'blocked', reason: 'hasta 4 jugadores' });
    expect(st('5', 3).state).toBe('recommended'); // both ends of the range are inside it
    expect(st('5', 6).state).toBe('recommended');
    expect(st('1', 4).state).toBe('recommended');
    expect(st('3', 2).state).toBe('recommended'); // minDuro == nMin
  });
  it('orders recommended first (fewer stars first, then nearest to the middle of the range), then warned, then blocked', () => {
    const l = lobbyMaps(4, base);
    expect(l.map((x) => x.map.id)).toEqual(['2', '1', '5', '3', '4']);
    expect(recommendedMaps(6, base).map((m) => m.id)).toEqual(['5']);
    const rank = { recommended: 0, warn: 1, blocked: 2 };
    const l1 = lobbyMaps(1).map((x) => rank[x.status.state]);
    expect(l1).toEqual([...l1].sort((a, b) => a - b));
  });
  it('the default is the first recommended map not played yet; once all were played, the first recommended', () => {
    expect(defaultMap(4, new Set(), base).id).toBe('2');
    expect(defaultMap(4, new Set(['1', '2']), base).id).toBe('5');
    expect(defaultMap(4, new Set(['1', '2', '3', '4', '5']), base).id).toBe('2');
  });
  it('a blocked selection is replaced by the recommended map of closest complexity', () => {
    expect(replacementMap(fixedMap('3')!, 6, base).id).toBe('5'); // 3 tops out at 4 players
    expect(replacementMap(fixedMap('1')!, 5, base).id).toBe('2');
  });
  it('"auto" draws among the maps recommended for N', () => {
    for (const n of [2, 5, 8].filter((k) => recommendedMaps(k).length)) {
      const rec = recommendedMaps(n);
      expect(pickFixedMap('auto', 'easy', () => 0, n).id).toBe(rec[0]!.id);
      expect(pickFixedMap('auto', 'easy', () => 0.999, n).id).toBe(rec[rec.length - 1]!.id);
    }
  });
  it('zero players count as two', () => {
    expect(lobbyN(0)).toBe(2);
    expect(lobbyN(1)).toBe(1);
  });
});
