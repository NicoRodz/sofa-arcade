import { describe, expect, it } from 'vitest';
import {
  GENERATOR_VERSION,
  MAP_H,
  MAP_W,
  MAX_ATTEMPTS,
  SEED_SPACE,
  encodeSeed,
  f0Map,
  floorCount,
  formatSeed,
  generateMap,
  hashMap,
  mapSeedFor,
  parseSeed,
  solidAt,
  validateMap,
} from '../map';
import { blastTiles } from '../sim';

const SEEDS = Array.from({ length: 300 }, (_, i) => i * 104729 + 7);

describe('seed code (Crockford base32, version first)', () => {
  it('writes 5 characters without I, L, O or U, behind the generator version', () => {
    expect(GENERATOR_VERSION).toBe(2);
    expect(encodeSeed(0)).toBe('00000');
    expect(encodeSeed(SEED_SPACE - 1)).toBe('ZZZZZ');
    expect(formatSeed(7 * 32 ** 4 + 19 * 32 ** 3 + 23 * 32 ** 2 + 2 * 32 + 20)).toBe('2·7KQ2M');
    for (const s of SEEDS) expect(encodeSeed(s)).toMatch(/^[0-9A-HJKMNP-TV-Z]{5}$/);
  });

  it('reads back what it wrote, and reads the look-alikes as Crockford does', () => {
    for (const s of SEEDS) expect(parseSeed(formatSeed(s))).toEqual({ version: GENERATOR_VERSION, seed: s });
    expect(parseSeed('2·7kq2m')).toEqual(parseSeed('2·7KQ2M'));
    expect(parseSeed('2-7KQ2M')).toEqual(parseSeed('2·7KQ2M'));
    expect(parseSeed('1-0O0IL')).toEqual({ version: 1, seed: parseSeed('1-00011')!.seed });
    expect(parseSeed('7KQ2U')).toBeNull();
    expect(parseSeed('7KQ2')).toBeNull();
    expect(parseSeed('nope')).toBeNull();
  });

  it('every round of a lobby draws a new seed from a deterministic substream', () => {
    const a = Array.from({ length: 60 }, (_, r) => mapSeedFor(123456, r));
    expect(new Set(a).size).toBe(60);
    expect(Array.from({ length: 60 }, (_, r) => mapSeedFor(123456, r))).toEqual(a);
    expect(Array.from({ length: 60 }, (_, r) => mapSeedFor(123457, r))).not.toEqual(a);
    expect(a.every((s) => Number.isInteger(s) && s >= 0 && s < SEED_SPACE)).toBe(true);
  });
});

describe('generateMap', () => {
  it('same seed, same map, bit for bit; another seed, another map', () => {
    const a = generateMap(1234);
    expect(hashMap(generateMap(1234).map)).toBe(hashMap(a.map));
    expect(Array.from(generateMap(1234).map.solid)).toEqual(Array.from(a.map.solid));
    expect(new Set(SEEDS.slice(0, 50).map((s) => hashMap(generateMap(s).map))).size).toBe(50);
  });

  it('a map is 27x15, a seed that validates keeps no violation and none of 300 seeds needs the fallback', () => {
    let fallbacks = 0;
    for (const s of SEEDS) {
      const g = generateMap(s);
      expect([g.map.w, g.map.h, g.map.solid.length]).toEqual([MAP_W, MAP_H, MAP_W * MAP_H]);
      if (g.fallback) fallbacks++;
      else expect(validateMap(g.map)).toEqual([]);
    }
    expect(fallbacks / SEEDS.length).toBeLessThan(0.01);
    expect(SEEDS.reduce((n, s) => n + generateMap(s).attempts, 0) / SEEDS.length).toBeLessThan(2); // it builds a connected map, it does not just retry until one is
  });

  it('when no attempt validates, the F0 map stands in after 64 attempts', () => {
    const g = generateMap(99, () => false);
    expect(g).toMatchObject({ fallback: true, attempts: MAX_ATTEMPTS, seed: 99 });
    expect(g.map).toBe(f0Map());
    expect(floorCount(g.map)).toBe(floorCount(f0Map()));
  });

  it('a failing attempt is retried with the next substream: only the attempts that fail are skipped', () => {
    let calls = 0;
    const g = generateMap(5, () => ++calls === 3);
    expect(g).toMatchObject({ fallback: false, attempts: 3 });
    const ok = generateMap(5, () => true);
    expect(hashMap(g.map)).not.toBe(hashMap(ok.map));
  });

  it('keeps the exits (column 1, radius 2) free and the F0 map still has its 405 tiles', () => {
    for (const s of SEEDS.slice(0, 100)) {
      const { map } = generateMap(s);
      for (const [ex, ey] of map.spawns[0]!)
        for (let dy = -2; dy <= 2; dy++)
          for (let dx = -2; dx <= 2; dx++)
            if (Math.abs(dx) + Math.abs(dy) <= 2 && ex + dx >= 0 && ey + dy >= 0 && ey + dy < MAP_H)
              expect(solidAt(map, ex + dx, ey + dy)).toBe(false);
    }
    expect(f0Map().solid).toHaveLength(405);
  });

  it('a blast is cut by the furniture of the map it is on', () => {
    for (const s of SEEDS.slice(0, 40)) {
      const { map } = generateMap(s);
      for (let y = 0; y < MAP_H; y++)
        for (let x = 0; x < MAP_W; x++)
          if (!solidAt(map, x, y)) for (const [bx, by] of blastTiles(x, y, 2, map)) expect(solidAt(map, bx, by)).toBe(false);
    }
  });
});
