import { describe, expect, it } from 'vitest';
import { DIFFICULTIES } from '@pichi/core/difficulty';
import { MAP_H, MAP_W, parseMap, type VersusMapDef } from './maps';
import {
  MAX_ATTEMPTS,
  VERSUS_TOPOLOGIES,
  composeVersus,
  generateVersus,
  halfLayout,
  stationCounts,
  type GeneratedVersus,
} from './generate';
import { SIGMAS, isometryCheck } from './maps/symmetry';
import { spawnTiles, stationsOf, teamRange, validateVersus } from './validate';

const asMap = (g: GeneratedVersus): VersusMapDef => ({
  id: 'gen',
  name: 'gen',
  rows: g.rows,
  nMin: g.nMin,
  nMax: g.nMax,
  minDuro: g.nMin,
  stars: 2,
  versus: { sigma: g.sigma, spawns: g.spawns },
});

describe('generateVersus', () => {
  it('the same seed, difficulty and players give the same map; the seed decides it (100 seeds, at least 80 different maps)', () => {
    for (const d of DIFFICULTIES) expect(generateVersus(12345, d, 6)).toEqual(generateVersus(12345, d, 6));
    const rows = new Set(Array.from({ length: 100 }, (_, seed) => generateVersus(seed, 'normal', 6).rows.join('|')));
    expect(rows.size).toBeGreaterThanOrEqual(80);
    // the seed is not just the topology: the same seed with the other topology forced is another map, and the same one again is the same
    expect(generateVersus(9, 'normal', 6, MAX_ATTEMPTS, { topology: 'stack' }).rows).not.toEqual(
      generateVersus(9, 'normal', 6, MAX_ATTEMPTS, { topology: 'side' }).rows,
    );
    expect(generateVersus(9, 'normal', 6, MAX_ATTEMPTS, { topology: 'stack' })).toEqual(
      generateVersus(9, 'normal', 6, MAX_ATTEMPTS, { topology: 'stack' }),
    );
  });

  it('500 seeds in a row per difficulty and player count: always valid and always generated (no fallback), at the first attempts', {
    timeout: 120_000,
  }, () => {
    const seen = new Set<string>();
    let slowest = 0;
    for (const d of DIFFICULTIES)
      for (const n of [2, 3, 4, 5, 6, 8])
        for (let seed = 0; seed < 500; seed++) {
          const g = generateVersus(seed, d, n);
          const tag = `${d} n=${n} seed ${seed}`;
          expect(g.fallback, tag).toBe(false);
          slowest = Math.max(slowest, g.attempts);
          const r = validateVersus(asMap(g)); // the validator again, from outside
          expect(r, tag).toMatchObject({ ok: true, errors: [], s: 1 });
          expect(g.rows.length).toBe(MAP_H);
          expect(isometryCheck(g.rows, SIGMAS[g.sigma]).s, tag).toBe(1);
          const team = teamRange(g.nMin, g.nMax);
          expect(g.spawns[0].length, tag).toBeGreaterThanOrEqual(team.max);
          expect(g.spawns[1].length, tag).toBe(g.spawns[0].length);
          seen.add(`${g.topology}/${g.archetype}`);
        }
    expect(slowest).toBeLessThanOrEqual(MAX_ATTEMPTS);
    expect([...seen].sort()).toEqual(
      expect.arrayContaining(['side/island', 'side/lanes', 'side/open', 'stack/island', 'stack/lanes', 'stack/open']),
    );
  });

  it('each kitchen has the stations of the design table for its biggest team, cheese only where the seed brings it', () => {
    for (const n of [2, 4, 6, 8])
      for (const d of DIFFICULTIES)
        for (let seed = 0; seed < 60; seed++) {
          const g = generateVersus(seed, d, n);
          const grid = parseMap(g.rows);
          const c = stationCounts(teamRange(g.nMin, g.nMax).max, d, g.mech);
          const tag = `${d} n=${n} seed ${seed}`;
          expect(stationsOf(grid, 'O').length, tag).toBe(2 * c.ovens);
          expect(stationsOf(grid, 'K').length, tag).toBe(2 * c.boards);
          expect(stationsOf(grid, 'E').length, tag).toBe(2 * c.serve);
          expect(stationsOf(grid, '3').length > 0, tag).toBe(g.mech.cheese);
          expect(g.mech.sink).toBe(false); // teams are at most 4 chefs: no washing
        }
  });

  it('works for a range of players: the half is validated for the smallest team (1 chef) and the biggest', () => {
    for (const d of DIFFICULTIES)
      for (let seed = 0; seed < 60; seed++) {
        const g = generateVersus(seed, d, 8, MAX_ATTEMPTS, { nMin: 2 });
        expect([g.nMin, g.nMax]).toEqual([2, 8]);
        expect(g.fallback).toBe(false);
        expect(validateVersus(asMap(g)).ok, `${d} seed ${seed}`).toBe(true);
        expect(spawnTiles(parseMap(g.rows)).length).toBe(2 * g.spawns[0].length);
      }
  });

  it('the half is composed by the isometry: halfLayout leaves the barrier as wall, composeVersus fills the other half', () => {
    const side = halfLayout('side').cells.map((r) => r.join(''));
    expect(side.every((r) => r.slice(7) === '#'.repeat(9))).toBe(true);
    const stack = halfLayout('stack').cells.map((r) => r.join(''));
    expect(stack.slice(4)).toEqual(Array(5).fill('#'.repeat(16)));
    for (const t of ['side', 'stack'] as const) {
      const half = halfLayout(t).cells.map((r) => r.join(''));
      const full = composeVersus(half, t);
      expect(full).toHaveLength(MAP_H);
      expect(full.every((r) => r.length === MAP_W)).toBe(true);
      expect(isometryCheck(full, SIGMAS[VERSUS_TOPOLOGIES[t]]).s).toBe(1);
    }
    // a marked tile in the half shows up at its twin
    const half = halfLayout('side').cells.map((r) => r.join(''));
    const marked = [...half];
    marked[2] = marked[2]!.slice(0, 3) + 'Q' + marked[2]!.slice(4);
    expect(composeVersus(marked, 'side')[2]![12]).toBe('Q');
    const stackHalf = halfLayout('stack').cells.map((r) => r.join(''));
    stackHalf[1] = stackHalf[1]!.slice(0, 3) + 'Q' + stackHalf[1]!.slice(4);
    expect(composeVersus(stackHalf, 'stack')[7]![12]).toBe('Q');
  });

  it('with no attempts at all, or when none validates, a fixed versus map comes back and it is valid', () => {
    for (const [n, topology] of [
      [8, 'side'],
      [6, 'stack'],
      [4, 'stack'],
    ] as const) {
      const g = generateVersus(7, 'normal', n, 0, { topology });
      expect(g.fallback).toBe(true);
      expect(g.archetype).toBe('fixed');
      expect(g.attempts).toBe(0);
      expect(g.sigma).toBe(VERSUS_TOPOLOGIES[topology]);
      expect(g.nMin).toBeLessThanOrEqual(n);
      expect(g.nMax).toBeGreaterThanOrEqual(n);
      expect(validateVersus(asMap(g)).ok).toBe(true);
    }
    expect(MAX_ATTEMPTS).toBe(200);
  });
});
