import { describe, expect, it } from 'vitest';
import { DIFFICULTIES, params } from '@pichi/core/difficulty';
import { FIXED_MAPS, MAP_H, MAP_W, MAPS_BY_DIFFICULTY, fixedMap, isFloor, parseMap, recommendedMaps, spawnPoints } from './maps';
import {
  MAX_ATTEMPTS,
  applyArchetype,
  generate,
  inBand,
  orderSpawns,
  pickMech,
  placeStations,
  resolveMap,
  scatterObstacles,
  shape,
  stationCounts,
  zonePuestos,
} from './generate';
import { mulberry32 } from '@pichi/core/rng';
import { createGame, addPlayer } from './overcooked';
import { metric } from './score';
import { accessTiles, keysOf, minPlayers, stationsOf, validate, validateMap, zoneShareProblems, zoneShares } from './validate';
import { PUESTOS, puestosFor } from './puestos';

describe('mulberry32', () => {
  it('is deterministic, in [0, 1) and differs between seeds', () => {
    const a = mulberry32(42),
      b = mulberry32(42),
      c = mulberry32(43);
    const xs = Array.from({ length: 5 }, () => a()),
      ys = Array.from({ length: 5 }, () => b());
    expect(xs).toEqual(ys);
    expect(xs).not.toEqual(Array.from({ length: 5 }, () => c()));
    for (let i = 0; i < 1000; i++) {
      const v = a();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
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

  it('500 seeds per difficulty: all valid, at least 90% inside the band (2 players)', { timeout: 60_000 }, () => {
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
    for (const n of [4, 6, 8])
      for (const d of DIFFICULTIES) {
        for (let seed = 0; seed < 60; seed++) {
          const g = generate(seed, d, n);
          const grid = parseMap(g.rows);
          expect(validate(grid).ok, `${d} n=${n} seed ${seed}`).toBe(true);
          const c = stationCounts(n, d, g.mech);
          expect(stationsOf(grid, 'K').length).toBe(c.boards);
          expect(stationsOf(grid, 'O').length).toBe(c.ovens);
          expect(stationsOf(grid, '1').length).toBe(c.crates);
          expect(stationsOf(grid, '2').length).toBe(c.crates);
          expect(stationsOf(grid, '3').length).toBe(c.cheese);
          expect(stationsOf(grid, 'E').length).toBe(c.serve);
          expect(stationsOf(grid, 'P').length).toBe(c.serve);
          expect(stationsOf(grid, 'U').length).toBe(c.wash);
          expect(stationsOf(grid, 'L').length).toBe(c.wash);
          expect(grid.flat().filter((t) => t.kind === 'station' && t.station === 'trash').length).toBe(c.trash);
          expect(spawnPoints(grid, n).length).toBe(n);
          expect(g.spawns).toHaveLength(n);
        }
      }
  });

  it('stations by team size follow the design table: ovens ceil(N/3), boards ceil((N+1)/3) (+1 cheese), E and P 1+floor(N/5), X 1+floor(N/4)', () => {
    expect(stationCounts(2, 'normal')).toMatchObject({ boards: 1, ovens: 1, crates: 1, serve: 1, trash: 1, wash: 0, cheese: 0 });
    expect(stationCounts(5, 'normal', { cheese: true, sink: true })).toMatchObject({
      boards: 3,
      ovens: 2,
      serve: 2,
      trash: 2,
      wash: 1,
      cheese: 1,
    });
    expect(stationCounts(8, 'normal')).toMatchObject({ boards: 3, ovens: 3, crates: 2, serve: 2, trash: 3 });
    expect(stationCounts(8, 'normal', { cheese: true, sink: false }).boards).toBe(4);
    expect(stationCounts(2, 'hard').boards).toBe(1);
    expect(stationCounts(8, 'hard').boards).toBe(2);
    expect(stationCounts(4, 'normal', { cheese: false, sink: true }).wash).toBe(0); // washing only from 5 players
  });

  it('mechanics come from the seed: no cheese for 2, washing only from 5, and the same seed always gives the same', () => {
    for (let seed = 0; seed < 100; seed++) {
      expect(pickMech(seed, 2)).toEqual({ cheese: false, sink: false });
      expect(pickMech(seed, 4).sink).toBe(false);
      expect(pickMech(seed, 8)).toEqual(pickMech(seed, 8));
    }
    const kinds = new Set(Array.from({ length: 200 }, (_v, s) => JSON.stringify(pickMech(s, 8))));
    expect(kinds.size).toBe(4); // all four combinations show up
  });

  it('a range of team sizes: spawns for nMax, valid for every N, floor for every chef', () => {
    for (const d of DIFFICULTIES)
      for (let seed = 0; seed < 40; seed++) {
        const g = generate(seed, d, 4, MAX_ATTEMPTS, { nMin: 3, nMax: 6 });
        expect([g.nMin, g.nMax]).toEqual([3, 6]);
        const grid = parseMap(g.rows);
        expect(grid.flat().filter((t) => t.kind === 'floor' && t.spawn).length).toBe(6);
        const def = {
          id: 'g',
          name: 'g',
          rows: g.rows,
          nMin: 3,
          nMax: 6,
          minDuro: minPlayers(grid),
          stars: 2 as const,
          spawns: g.spawns,
          puestos: g.puestos,
        };
        expect(validateMap(def), `${d} seed ${seed}`).toEqual({ ok: true, errors: [] });
        expect(stationCounts(6, d, g.mech).ovens).toBe(stationsOf(grid, 'O').length);
      }
  });

  it('the range is part of the result: same seed with another range is another kitchen', () => {
    expect(generate(5, 'normal', 4, MAX_ATTEMPTS, { nMin: 4, nMax: 4 })).toEqual(generate(5, 'normal', 4));
    expect(generate(5, 'normal', 4, MAX_ATTEMPTS, { nMin: 3, nMax: 7 }).rows).not.toEqual(generate(5, 'normal', 4).rows);
  });

  it('spawns are ordered like the puesto table: spawn 1 is at least as close to the dough crate and a board as any other spawn', () => {
    const dist = (pts: [number, number][], sp: [number, number]) =>
      Math.min(...pts.map(([x, y]) => Math.abs(x - sp[0]) + Math.abs(y - sp[1])));
    for (let seed = 0; seed < 60; seed++) {
      const g = generate(seed, 'easy', 6);
      const grid = parseMap(g.rows);
      const cost = (sp: [number, number]) => dist(stationsOf(grid, '1'), sp) + dist(stationsOf(grid, 'K'), sp);
      const [first, ...rest] = g.spawns! as [number, number][];
      for (const other of rest) expect(cost(first!)).toBeLessThanOrEqual(cost(other));
    }
    expect(
      orderSpawns(
        fixedMap('1')!.rows,
        [
          [10, 4],
          [4, 4],
        ],
        4,
        { cheese: false, sink: false },
      )[0],
    ).toEqual([4, 4]); // spawn 1 = Masa: the dough crate is at the left of map 1
  });

  it('zone maps get zone puestos (prep / bake) and every zone with a spawn gets 15% of the actions', () => {
    let zones = 0;
    for (const d of ['normal', 'hard'] as const)
      for (let seed = 0; seed < 80; seed++) {
        const g = generate(seed, d, 6);
        if (g.archetype !== 'river' && g.archetype !== 'corridor') {
          expect(g.puestos).toBeUndefined();
          continue;
        }
        zones++;
        expect(g.puestos).toHaveLength(6);
        expect(g.puestos!.flat()).toContain('prep');
        expect(g.puestos!.flat()).toContain('horno');
        expect(zoneShareProblems(parseMap(g.rows))).toEqual([]);
      }
    expect(zones).toBeGreaterThan(40);
    expect(
      zonePuestos(
        [
          [2, 2],
          [10, 2],
          [3, 5],
        ],
        (x) => (x < 7 ? 'A' : 'B'),
        false,
        { cheese: false, sink: false },
      ),
    ).toEqual([['prep'], ['horno', 'reparto'], ['prep']]);
    expect(
      zonePuestos(
        [
          [2, 2],
          [10, 2],
        ],
        (x) => (x < 7 ? 'A' : 'B'),
        true,
        { cheese: false, sink: true },
      ),
    ).toEqual([
      ['prep', 'entrega'],
      ['horno', 'platos', 'lavado'],
    ]);
  });

  it('zone shares of the fixed maps: every region that holds a spawn gets at least 15% (Tres cuartos plating room is the tightest)', () => {
    for (const m of FIXED_MAPS) expect(zoneShareProblems(parseMap(m.rows)), m.name).toEqual([]);
    const tres = zoneShares(parseMap(fixedMap('13')!.rows));
    expect(Math.min(...tres)).toBeGreaterThanOrEqual(0.15);
    expect(Math.min(...tres)).toBeLessThan(0.2);
    expect(PUESTOS.apoyo.picks).toEqual([]);
    expect(puestosFor(2, { cheese: false, sink: false })).toHaveLength(2);
  });

  it('spawns are N distinct floor tiles, 2+ apart, and river maps put players on both sides', () => {
    for (let seed = 0; seed < 100; seed++) {
      const g = generate(seed, 'hard', 4);
      const grid = parseMap(g.rows);
      const sp: [number, number][] = [];
      grid.forEach((row, y) =>
        row.forEach((t, x) => {
          if (t.kind === 'floor' && t.spawn) sp.push([x, y]);
        }),
      );
      expect(sp.length).toBe(4);
      for (const [x, y] of sp) expect(isFloor(grid, x, y)).toBe(true);
      for (let i = 0; i < sp.length; i++)
        for (let j = i + 1; j < sp.length; j++)
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
      expect(['river', 'corridor', 'lanes']).toContain(generate(seed, 'hard', 2).archetype);
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
    const game = createGame({ rows: g.rows, spawns: g.spawns as [number, number][], n: 6, difficulty: 'normal' });
    for (let i = 0; i < 6; i++) addPlayer(game, i + 1, i);
    expect(game.grid.length * game.grid[0]!.length).toBe(MAP_H * MAP_W);
    expect(new Set([...game.players.values()].map((p) => `${Math.floor(p.x)},${Math.floor(p.y)}`)).size).toBe(6);
    expect(params('normal', 6).maxOrders).toBe(game.params.maxOrders);
  });
});

describe('placement rules', () => {
  it('every recipe station gets its own access tile (matching, no two stations share one)', () => {
    for (const d of ['normal', 'hard'] as const)
      for (let seed = 0; seed < 300; seed++) {
        const grid = parseMap(generate(seed, d, 8).rows);
        const stations = keysOf(grid).flatMap((k) => stationsOf(grid, k));
        const owner = new Map<string, number>();
        const assign = (i: number, seen: Set<string>): boolean => {
          for (const [ax, ay] of accessTiles(grid, ...stations[i]!)) {
            const key = `${ax},${ay}`;
            if (seen.has(key)) continue;
            seen.add(key);
            if (!owner.has(key) || assign(owner.get(key)!, seen)) {
              owner.set(key, i);
              return true;
            }
          }
          return false;
        };
        for (let i = 0; i < stations.length; i++) expect(assign(i, new Set()), `${d} seed ${seed} station ${i}`).toBe(true);
      }
  });

  it('placement claims one distinct access tile per station', () => {
    for (let seed = 0; seed < 200; seed++)
      for (const [arch, diff, n] of [
        ['island', 'normal', 8],
        ['open', 'easy', 8],
        ['river', 'normal', 6],
        ['corridor', 'hard', 8],
      ] as const) {
        const rng = mulberry32(seed);
        const layout = applyArchetype(arch, diff, rng);
        scatterObstacles(layout.cells, 4, rng);
        const claimed = placeStations(layout, n, diff, rng);
        if (!claimed) continue;
        const c = stationCounts(n, diff);
        expect(claimed.size, `${arch} seed ${seed}`).toBe(2 * c.serve + c.ovens + c.boards + 2 * c.crates + c.trash);
      }
  });

  it('zones: boards and crates on side A, ovens and trays on B, the delivery counter on A for hard and B for normal', () => {
    for (const [d, eZone] of [
      ['hard', 'A'],
      ['normal', 'B'],
    ] as const) {
      let seen = 0;
      for (let seed = 0; seed < 150; seed++) {
        const g = generate(seed, d, 2);
        if (g.archetype !== 'river' && g.archetype !== 'corridor') continue;
        seen++;
        const walls = [...g.rows[0]!].map((c, x) => ((c === '~' || c === '#') && x > 1 && x < 14 ? x : -1)).filter((x) => x >= 0);
        const mid = (walls[0]! + walls[walls.length - 1]! + 1) / 2;
        const grid = parseMap(g.rows);
        const onSide = (k: Parameters<typeof stationsOf>[1], zone: 'A' | 'B') =>
          stationsOf(grid, k).every((p) => accessTiles(grid, ...p).some(([ax]) => ax < mid === (zone === 'A')));
        expect(
          [onSide('K', 'A'), onSide('1', 'A'), onSide('2', 'A'), onSide('O', 'B'), onSide('P', 'B'), onSide('E', eZone)],
          `${d} seed ${seed}`,
        ).toEqual([true, true, true, true, true, true]);
      }
      expect(seen).toBeGreaterThan(20);
    }
  });

  it('loose obstacles never split the floor nor remove a passing counter', () => {
    for (let seed = 0; seed < 40; seed++) {
      for (const [arch, diff] of [
        ['river', 'normal'],
        ['corridor', 'normal'],
        ['island', 'normal'],
        ['open', 'normal'],
      ] as const) {
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
