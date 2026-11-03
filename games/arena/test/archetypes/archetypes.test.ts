import { describe, expect, it } from 'vitest';
import {
  ARCHETYPES,
  SEED_SPACE,
  archetypeOf,
  emptyMap,
  generateMap,
  hashMap,
  mapSeedFor,
  elementsOf,
  mapStates,
  v1Connection,
  v8Signature,
  v9LivingConnection,
  validateMap,
  type Archetype,
  type LivingElement,
  type TileMap,
} from '../../map';

const SEEDS = Array.from({ length: 4000 }, (_, i) => (i * 3359 + 17) % SEED_SPACE);
const of = (kind: Archetype, n: number) => SEEDS.filter((s) => archetypeOf(s) === kind).slice(0, n);

describe('the seed picks the archetype', () => {
  it('is deterministic and the four come out evenly (25 +- 3 %) over 4000 seeds and over the seeds of a lobby', () => {
    expect(SEEDS.map(archetypeOf)).toEqual(SEEDS.map(archetypeOf));
    const lobby = Array.from({ length: 4000 }, (_, r) => mapSeedFor(555, r));
    for (const seeds of [SEEDS, lobby])
      for (const k of ARCHETYPES)
        expect(Math.abs(seeds.filter((s) => archetypeOf(s) === k).length / seeds.length - 0.25)).toBeLessThan(0.03);
  });
});

describe.each(ARCHETYPES)('%s', (kind) => {
  it('30 seeds: the map is of that archetype, valid (V1-V7), with its signature (V8), mirrored, and the same seed gives the same map', () => {
    for (const seed of of(kind, 30)) {
      const g = generateMap(seed);
      expect(g.archetype).toBe(kind);
      expect(validateMap(g.map)).toEqual([]);
      expect(v8Signature(kind, g.map)).toBeNull();
      for (let y = 0; y < g.map.h; y++)
        for (let x = 0; x < g.map.w; x++) expect(g.map.solid[y * g.map.w + x]).toBe(g.map.solid[y * g.map.w + (g.map.w - 1 - x)]);
      expect(hashMap(generateMap(seed).map)).toBe(hashMap(g.map));
    }
  });

  it('V8 is red on an empty map and V9 is green with the living map placed (every state of every pair connected)', () => {
    expect(v8Signature(kind, emptyMap())).not.toBeNull();
    for (const seed of of(kind, 60)) {
      const g = generateMap(seed, undefined, true);
      expect(g.archetype).toBe(kind);
      expect(v9LivingConnection(g.map, elementsOf(g.living))).toBeNull(); // the real elements (brushes 4 states, sofas 2), not stand-ins
      for (const st of mapStates(g.map, elementsOf(g.living))) expect(v1Connection(st.map), `seed ${seed} states ${st.states}`).toBeNull();
    }
  });

  it('the middle line still serves the Hourglass (a 3x3 with 7+ floor tiles), the golden zone (3 free rows) and the big pinata (9+ free tiles)', () => {
    for (const seed of of(kind, 30)) {
      const { map } = generateMap(seed);
      const free = (x: number, y: number) => map.solid[y * map.w + x] === 0;
      const column = Array.from({ length: map.h }, (_, y) => y).filter((y) => free(13, y));
      expect(column.length).toBeGreaterThanOrEqual(9);
      const circle = Math.max(
        ...Array.from({ length: map.h - 2 }, (_, k) => k + 1).map(
          (cy) => [12, 13, 14].flatMap((x) => [cy - 1, cy, cy + 1].map((y) => free(x, y))).filter(Boolean).length,
        ),
      );
      expect(circle).toBeGreaterThanOrEqual(7);
      expect(column.some((y) => column.includes(y + 1) && column.includes(y + 2))).toBe(true);
    }
  });
});

describe('V8 tells the archetypes apart', () => {
  it('Plaza and Ocho signatures reject every map of the other three, Pasillos accepts at most 10 % of them (50 maps each)', () => {
    const maps = Object.fromEntries(ARCHETYPES.map((k) => [k, of(k, 50).map((s) => generateMap(s).map)])) as Record<Archetype, TileMap[]>;
    for (const [kind, most] of [
      ['plaza', 0],
      ['ocho', 0],
      ['pasillos', 15],
    ] as const) {
      const others = ARCHETYPES.filter((k) => k !== kind).flatMap((k) => maps[k]);
      expect(others.filter((m) => v8Signature(kind, m) === null).length, kind).toBeLessThanOrEqual(most);
    }
  });
});

describe('the Plaza is 7x5 (literal numbers, not the validator constants)', () => {
  it('V8 accepts a walled map with a free 7x5 on the middle line and rejects one with a 5x5 or a 7x4', () => {
    const walled = (x0: number, x1: number, y0: number, y1: number): TileMap => {
      const m = emptyMap();
      m.solid.fill(1);
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) m.solid[y * m.w + x] = 0;
      return m;
    };
    expect(v8Signature('plaza', walled(10, 16, 5, 9))).toBeNull();
    expect(v8Signature('plaza', walled(11, 15, 5, 9))).toMatch(/no free 7x5/);
    expect(v8Signature('plaza', walled(10, 16, 5, 8))).toMatch(/no free 7x5/);
  });

  it('30 Plaza maps hold a free block of columns 10-16 and 5 consecutive rows', () => {
    for (const seed of of('plaza', 30)) {
      const { map } = generateMap(seed);
      const free = (x: number, y: number) => map.solid[y * map.w + x] === 0;
      const rows = Array.from({ length: map.h }, (_, y) => y).filter((y) =>
        Array.from({ length: 7 }, (_, i) => free(10 + i, y)).every(Boolean),
      );
      expect(
        rows.some((y) => [1, 2, 3, 4].every((d) => rows.includes(y + d))),
        `seed ${seed}`,
      ).toBe(true);
    }
  });
});

describe('V9 and the Clasico fallback', () => {
  it('V9 names the combination that cuts the map, and Clasico is the F2 generator bit for bit (hashes taken on master 48dad5f)', () => {
    const g = generateMap(2);
    const wallOff: LivingElement = {
      id: 'door',
      states: 2,
      closed: (s) => (s === 1 ? Array.from({ length: g.map.h }, (_, y) => [13, y] as const) : []),
    };
    expect(v9LivingConnection(g.map, [wallOff])).toMatch(/^states 1: /);
    const pins: Record<number, number> = { 1: 787330822, 2: 1023192995, 3: 3748460630, 424242: 3814652491 };
    for (const [seed, h] of Object.entries(pins)) expect(hashMap(generateMap(Number(seed), undefined, false, false).map)).toBe(h);
  });
});
