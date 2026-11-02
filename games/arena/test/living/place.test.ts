import { describe, expect, it } from 'vitest';
import {
  FOUNTAIN_TILE,
  LIVING_MAX_X,
  MAP_W,
  MAX_LIVING_PAIRS,
  elementsOf,
  footprint,
  generateMap,
  mapStates,
  v1Connection,
  v2Crossings,
  v3Exits,
  validateMap,
} from '../../map';
import { CLOCK_X, GOLD_COLS, clockRow, createEvents } from '../../sim';

const SEEDS = Array.from({ length: 150 }, (_, i) => i * 7919 + 13);
const gen = (seed: number) => generateMap(seed, undefined, true);

describe('the living map is placed by the seed', () => {
  it('same seed, same elements; none unless asked for, and never on the fallback', () => {
    expect(gen(42).living).toEqual(gen(42).living);
    expect(generateMap(42).living).toEqual([]);
    expect(generateMap(42, () => false, true)).toMatchObject({ fallback: true, living: [] });
  });

  it('the furniture of a seed is the same with or without the living map', () => {
    for (const seed of SEEDS.slice(0, 30)) expect(gen(seed).map.solid).toEqual(generateMap(seed).map.solid);
  });

  it('the seed decides how many pairs (1 to 3, under the plan cap of 4), which kinds, and whether the fountain stands', () => {
    const kinds = new Set<string>();
    const pairs = new Set<number>();
    const fountains = new Set<boolean>();
    for (const seed of SEEDS) {
      const l = gen(seed).living;
      l.forEach((e) => kinds.add(e.kind));
      pairs.add(l.filter((e) => e.kind !== 'fountain').length);
      fountains.add(l.some((e) => e.kind === 'fountain'));
      expect(l.filter((e) => e.kind !== 'fountain').length).toBeLessThanOrEqual(MAX_LIVING_PAIRS);
      expect(l.filter((e) => e.kind === 'fountain').length).toBeLessThanOrEqual(1);
    }
    expect([...kinds].sort()).toEqual(['brush', 'fountain', 'sofa']);
    expect(pairs.size).toBeGreaterThanOrEqual(3);
    expect(fountains).toEqual(new Set([true, false]));
    let freeCentre = 0;
    let without = 0; // the centre is floor and the seed still says no: the odds are not 1
    for (const seed of SEEDS) {
      const g = gen(seed);
      if (g.map.solid[FOUNTAIN_TILE[1] * MAP_W + FOUNTAIN_TILE[0]] !== 0) continue;
      freeCentre++;
      if (!g.living.some((e) => e.kind === 'fountain')) without++;
    }
    expect(without).toBeGreaterThan(freeCentre * 0.15);
    expect(without).toBeLessThan(freeCentre * 0.55); // about a third
  });

  it('V1-V3 hold in every combination of states, V4-V7 on the base map (150 seeds)', () => {
    let combos = 0;
    for (const seed of SEEDS) {
      const g = gen(seed);
      expect(validateMap(g.map, elementsOf(g.living))).toEqual([]);
      for (const st of mapStates(g.map, elementsOf(g.living))) {
        combos++;
        expect([v1Connection(st.map), v2Crossings(st.map), v3Exits(st.map)]).toEqual([null, null, null]);
      }
    }
    expect(combos).toBeGreaterThan(SEEDS.length * 2);
  });

  it('every part sits on base floor, in its team half (column 9 or less, or the mirror), never on another element', () => {
    for (const seed of SEEDS) {
      const { map, living } = gen(seed);
      const seen = new Set<string>();
      for (const spec of living.filter((e) => e.kind !== 'fountain')) {
        const mine = new Set(footprint(spec).map(([x, y]) => `${x},${y}`)); // a sofa's two ends share a tile
        for (const k of mine) {
          const [x, y] = k.split(',').map(Number) as [number, number];
          expect(map.solid[y * MAP_W + x]).toBe(0);
          expect(Math.min(x, MAP_W - 1 - x)).toBeLessThanOrEqual(LIVING_MAX_X);
          expect(seen.has(k)).toBe(false);
        }
        mine.forEach((k) => seen.add(k));
      }
    }
  });

  it('the fountain stands on (13, 7) and only when that tile is floor', () => {
    let stood = 0;
    for (const seed of SEEDS) {
      const { map, living } = gen(seed);
      const f = living.find((e) => e.kind === 'fountain');
      const free = map.solid[FOUNTAIN_TILE[1] * MAP_W + FOUNTAIN_TILE[0]] === 0;
      if (f) {
        stood++;
        expect([f.x, f.y]).toEqual(FOUNTAIN_TILE);
        expect(free).toBe(true);
      }
    }
    expect(stood).toBeGreaterThan(20);
  });
});

describe('the fountain, the Hourglass circle and the golden zone share the middle line without touching', () => {
  const near = (cx: number, cy: number, x0: number, x1: number, y0: number, y1: number) =>
    Math.abs(Math.min(Math.max(cx, x0), x1) - cx) + Math.abs(Math.min(Math.max(cy, y0), y1) - cy);

  it('with a fountain, the circle and the zone are 3 or more tiles from it (outside its splash), for every seed', () => {
    let checked = 0;
    for (const seed of SEEDS) {
      const { map, living } = gen(seed);
      if (!living.some((e) => e.kind === 'fountain')) continue;
      checked++;
      const row = clockRow(map, seed, true);
      expect(near(13, 7, CLOCK_X - 1, CLOCK_X + 1, row - 1, row + 1)).toBeGreaterThan(2);
      for (const p of createEvents(map, seed, 4500, true).program.filter((q) => q.kind === 'gold'))
        expect(near(13, 7, GOLD_COLS[0], GOLD_COLS[1], p.row, p.row + 2)).toBeGreaterThan(2);
    }
    expect(checked).toBeGreaterThan(20);
  });

  it('without a fountain the circle and the program are what F4 drew (bit for bit)', () => {
    for (const seed of SEEDS.slice(0, 40)) {
      const { map } = generateMap(seed);
      expect(createEvents(map, seed, 4500, false)).toEqual(createEvents(map, seed, 4500));
      expect(clockRow(map, seed, false)).toBe(clockRow(map, seed));
    }
  });

  it('the pairs never reach the middle line columns (the circle is 12-14, the zone 10-16)', () => {
    for (const seed of SEEDS)
      for (const spec of gen(seed).living.filter((e) => e.kind !== 'fountain'))
        for (const [x] of footprint(spec)) expect(x < GOLD_COLS[0] || x > GOLD_COLS[1]).toBe(true);
  });
});
