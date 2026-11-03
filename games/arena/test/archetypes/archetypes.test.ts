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
