import { describe, expect, it } from 'vitest';
import { DIFFICULTIES, params } from './difficulty';
import { DIRS, MAP_H, MAP_W, MAPS_BY_DIFFICULTY, fixedMap, isFloor, parseMap, recommendedMaps, spawnPoints } from './maps';
import { MAX_ATTEMPTS, applyArchetype, generate, inBand, placeStations, resolveMap, scatterObstacles, shape, stationCounts } from './generate';
import { mulberry32 } from './rng';
import { createGame, addPlayer } from './overcooked';
import { metric } from './score';
import { STATION_KEYS, accessTiles, stationsOf, validate } from './validate';

describe('mulberry32', () => {
  it('is deterministic, in [0, 1) and differs between seeds', () => {
    const a = mulberry32(42), b = mulberry32(42), c = mulberry32(43);
    const xs = Array.from({ length: 5 }, () => a()), ys = Array.from({ length: 5 }, () => b());
    expect(xs).toEqual(ys);
    expect(xs).not.toEqual(Array.from({ length: 5 }, () => c()));
    for (let i = 0; i < 1000; i++) { const v = a(); expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThan(1); }
    expect(mulberry32(1)()).toBeCloseTo(0.6270739405881613, 12); // reference value of the published algorithm
  });
});

describe('generate', () => {
  it('the same seed, difficulty and team give an identical grid', () => {
    for (const d of DIFFICULTIES) {
      expect(generate(12345, d, 4)).toEqual(generate(12345, d, 4));
    }
    const rows = new Set(Array.from({ length: 30 }, (_, s) => generate(s, 'normal', 2).rows.join('|')));
    expect(rows.size).toBeGreaterThan(20);
  });

  it('500 seeds per difficulty: all valid, at least 90% inside the band (2 players)', () => {
    for (const d of DIFFICULTIES) {
      let inside = 0;
      for (let seed = 0; seed < 500; seed++) {
        const g = generate(seed, d, 2);
        expect(g.rows.length).toBe(MAP_H);
        const grid = parseMap(g.rows);
        expect(validate(grid), `${d} seed ${seed}`).toEqual({ ok: true, errors: [] });
        expect(inBand(metric(grid, 2).D, d)).toBe(g.inBand);
        if (g.inBand) inside++;
      }
      expect(inside / 500, d).toBeGreaterThanOrEqual(0.9);
    }
  });

  it('also valid with 4, 6 and 8 players, with the station counts of the design table', () => {
    for (const n of [4, 6, 8]) for (const d of DIFFICULTIES) {
      for (let seed = 0; seed < 60; seed++) {
        const g = generate(seed, d, n);
        const grid = parseMap(g.rows);
        expect(validate(grid).ok, `${d} n=${n} seed ${seed}`).toBe(true);
        const c = stationCounts(n, d);
        expect(stationsOf(grid, 'K').length).toBe(c.boards);
        expect(stationsOf(grid, 'O').length).toBe(c.ovens);
        expect(stationsOf(grid, '1').length).toBe(c.crates);
        expect(stationsOf(grid, '2').length).toBe(c.crates);
        expect(spawnPoints(grid, n).length).toBe(n);
      }
    }
  });

  it('stations per team size: 2-3 -> 2 boards/2 ovens, 4-5 -> 3/2, 6-8 -> 4/3 with 2 crates each; hard has one board less', () => {
    expect(stationCounts(2, 'normal')).toEqual({ boards: 2, ovens: 2, crates: 1 });
    expect(stationCounts(5, 'easy')).toEqual({ boards: 3, ovens: 2, crates: 1 });
    expect(stationCounts(8, 'normal')).toEqual({ boards: 4, ovens: 3, crates: 2 });
    expect(stationCounts(2, 'hard').boards).toBe(1);
    expect(stationCounts(8, 'hard').boards).toBe(3);
  });

  it('spawns are N distinct floor tiles, 2+ apart, and river maps put players on both sides', () => {
    for (let seed = 0; seed < 100; seed++) {
      const g = generate(seed, 'hard', 4);
      const grid = parseMap(g.rows);
      const sp: [number, number][] = [];
      grid.forEach((row, y) => row.forEach((t, x) => { if (t.kind === 'floor' && t.spawn) sp.push([x, y]); }));
      expect(sp.length).toBe(4);
      for (const [x, y] of sp) expect(isFloor(grid, x, y)).toBe(true);
      for (let i = 0; i < sp.length; i++) for (let j = i + 1; j < sp.length; j++)
        expect(Math.abs(sp[i]![0] - sp[j]![0]) + Math.abs(sp[i]![1] - sp[j]![1])).toBeGreaterThanOrEqual(2);
      if (g.archetype === 'river') {
        const xr = [...g.rows[0]!].indexOf('~');
        expect(sp.filter(([x]) => x < xr).length).toBe(2);
      }
      if (g.archetype === 'corridor') {
        const wall = [...g.rows[0]!].map((c, x) => (c === '#' && x > 1 && x < 14 ? x : -1)).filter((x) => x >= 0);
        const mid = (wall[0]! + wall[wall.length - 1]! + 1) / 2;
        expect(sp.filter(([x]) => x < mid).length).toBe(2);
      }
    }
  });

  it('difficulty picks the archetypes: easy has no river or corridor, hard has no open or island', () => {
    for (let seed = 0; seed < 100; seed++) {
      expect(['open', 'island']).toContain(generate(seed, 'easy', 2).archetype);
      expect(['river', 'corridor']).toContain(generate(seed, 'hard', 2).archetype);
    }
  });

  it('falls back to the first fixed map of the difficulty when nothing validates', () => {
    for (const d of DIFFICULTIES) {
      const g = generate(7, d, 2, 0);
      expect(g.archetype).toBe('fixed');
      expect(g.rows).toEqual(fixedMap(MAPS_BY_DIFFICULTY[d][0]!)!.rows);
    }
    expect(MAX_ATTEMPTS).toBe(200);
  });

  it('a generated map plays: the game builds with every recipe station and N players on floor', () => {
    const g = generate(3, 'normal', 6);
    const game = createGame({ rows: g.rows, n: 6, difficulty: 'normal' });
    for (let i = 0; i < 6; i++) addPlayer(game, i + 1, i);
    expect(game.grid.length * game.grid[0]!.length).toBe(MAP_H * MAP_W);
    expect(new Set([...game.players.values()].map((p) => `${Math.floor(p.x)},${Math.floor(p.y)}`)).size).toBe(6);
    expect(params('normal', 6).maxOrders).toBe(game.params.maxOrders);
  });
});

describe('placement rules', () => {
  it('every recipe station gets its own access tile (matching, no two stations share one)', () => {
    for (const d of ['normal', 'hard'] as const) for (let seed = 0; seed < 300; seed++) {
      const grid = parseMap(generate(seed, d, 8).rows);
      const stations = STATION_KEYS.flatMap((k) => stationsOf(grid, k));
      const owner = new Map<string, number>();
      const assign = (i: number, seen: Set<string>): boolean => {
        for (const [ax, ay] of accessTiles(grid, ...stations[i]!)) {
          const key = `${ax},${ay}`;
          if (seen.has(key)) continue;
          seen.add(key);
          if (!owner.has(key) || assign(owner.get(key)!, seen)) { owner.set(key, i); return true; }
        }
        return false;
      };
      for (let i = 0; i < stations.length; i++) expect(assign(i, new Set()), `${d} seed ${seed} station ${i}`).toBe(true);
    }
  });

  it('placement claims one distinct access tile per station', () => {
    for (let seed = 0; seed < 200; seed++) for (const [arch, diff, n] of [['island', 'normal', 8], ['open', 'easy', 8], ['river', 'normal', 6], ['corridor', 'hard', 8]] as const) {
      const rng = mulberry32(seed);
      const layout = applyArchetype(arch, diff, rng);
      scatterObstacles(layout.cells, 4, rng);
      const claimed = placeStations(layout, n, diff, rng);
      if (!claimed) continue;
      const c = stationCounts(n, diff);
      expect(claimed.size, `${arch} seed ${seed}`).toBe(1 + c.ovens + 1 + c.boards + 2 * c.crates);
    }
  });

  it('zones: boards and crates on side A, ovens and trays on B, the delivery counter on A for hard and B for normal', () => {
    for (const [d, eZone] of [['hard', 'A'], ['normal', 'B']] as const) {
      let seen = 0;
      for (let seed = 0; seed < 150; seed++) {
        const g = generate(seed, d, 2);
        if (g.archetype !== 'river' && g.archetype !== 'corridor') continue;
        seen++;
        const walls = [...g.rows[0]!].map((c, x) => ((c === '~' || c === '#') && x > 1 && x < 14 ? x : -1)).filter((x) => x >= 0);
        const mid = (walls[0]! + walls[walls.length - 1]! + 1) / 2;
        const grid = parseMap(g.rows);
        const onSide = (k: Parameters<typeof stationsOf>[1], zone: 'A' | 'B') =>
          stationsOf(grid, k).every((p) => accessTiles(grid, ...p).some(([ax]) => (ax < mid) === (zone === 'A')));
        expect([onSide('K', 'A'), onSide('1', 'A'), onSide('2', 'A'), onSide('O', 'B'), onSide('P', 'B'), onSide('E', eZone)], `${d} seed ${seed}`).toEqual([true, true, true, true, true, true]);
      }
      expect(seen).toBeGreaterThan(20);
    }
  });

  it('loose obstacles never split the floor nor remove a passing counter', () => {
    for (let seed = 0; seed < 40; seed++) {
      for (const [arch, diff] of [['river', 'normal'], ['corridor', 'normal'], ['island', 'normal'], ['open', 'normal']] as const) {
        const rng = mulberry32(seed);
        const layout = applyArchetype(arch, diff, rng);
        const before = shape(layout.cells);
        scatterObstacles(layout.cells, 15, rng);
        expect(shape(layout.cells), `${arch} seed ${seed}`).toBe(before);
      }
    }
  });
});

describe('resolveMap', () => {
  it('"random" is the generated map of the lobby seed; other choices are fixed maps', () => {
    const r = resolveMap('random', 77, 'normal', 3, () => 0);
    expect(r.rows).toEqual(generate(77, 'normal', 3).rows);
    expect(r.name).toContain('77');
    expect(resolveMap('3', 77, 'normal', 3, () => 0).rows).toEqual(fixedMap('3')!.rows);
    const auto = resolveMap('auto', 77, 'hard', 3, () => 0.99);
    expect(recommendedMaps(3).map((m) => m.id)).toContain(auto.id); // "auto" draws among the maps recommended for N
    expect(auto.rows).toEqual(fixedMap(auto.id)!.rows);
  });
});
