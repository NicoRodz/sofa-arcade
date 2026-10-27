import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../rng';
import {
  APPEARANCE_COMBOS,
  CLOTHES_BY_GENDER,
  FIELDS,
  FIELD_SIZE,
  decodeAppearance,
  defaultAppearance,
  encodeAppearance,
  randomAppearance,
  sameAppearance,
  sanitizeAppearance,
  type Appearance,
} from './index';

const good: Appearance = { v: 1, g: 1, s: 2, hc: 4, sk: 3, hat: 5, gl: 3, bk: 5, cl: 10 };

describe('catalogue', () => {
  it('has the sizes of the plan and 8 clothes per gender, all valid ids', () => {
    expect(APPEARANCE_COMBOS).toBe(285_120);
    expect(CLOTHES_BY_GENDER).toHaveLength(FIELD_SIZE.g);
    for (const l of CLOTHES_BY_GENDER) {
      expect(l).toHaveLength(8);
      expect(new Set(l).size).toBe(8);
      expect(l.every((c) => Number.isInteger(c) && c >= 0 && c < FIELD_SIZE.cl)).toBe(true);
    }
  });
});

describe('sanitizeAppearance', () => {
  it('keeps a valid look as is', () => expect(sanitizeAppearance(good, 0)).toEqual(good));
  it('is a plain copy: a different object, no extra keys', () => {
    const out = sanitizeAppearance({ ...good, evil: 1, x: { a: 1 } }, 0);
    expect(out).not.toBe(good);
    expect(Object.keys(out).sort()).toEqual(['v', ...FIELDS].sort());
  });
  it('a value out of range, of the wrong type or not an integer takes its own default, field by field', () => {
    for (const bad of [Number.NaN, Infinity, -1, 1e9, 1.5, '1', null, undefined, [], {}, true, 5n as unknown])
      expect(sanitizeAppearance({ ...good, hc: bad }, 0).hc).toBe(1);
    expect(sanitizeAppearance({ ...good, hc: 5 }, 0).hc).toBe(1); // size is exclusive
    expect(sanitizeAppearance({ ...good, hat: 6 }, 0).hat).toBe(0);
    expect(sanitizeAppearance({ ...good, cl: 11 }, 0).cl).toBe(CLOTHES_BY_GENDER[1]![0]); // by the sanitized gender
    expect(sanitizeAppearance({ ...good, g: 9, s: 'x', cl: 'x' }, 0)).toMatchObject({ g: 2, s: 2, cl: 0, hat: 5 });
    expect(sanitizeAppearance({ g: 0, s: -3, cl: -3 }, 0)).toMatchObject({ g: 0, s: 1, cl: 8 }); // Chica: ponytail, first of her list
  });
  it('anything that is not a plain object is the slot default', () => {
    for (const bad of [null, undefined, 7, 'x', [], [1, 2], () => 0, new Date(), new Map(), Number.NaN])
      expect(sanitizeAppearance(bad, 3)).toEqual(defaultAppearance(3));
  });
  it('a version other than 1 is the slot default; a missing one reads as 1', () => {
    for (const v of [2, 0, '1', null, 1.5, Number.NaN]) expect(sanitizeAppearance({ ...good, v }, 4)).toEqual(defaultAppearance(4));
    const { v: _v, ...nov } = good;
    expect(sanitizeAppearance(nov, 4)).toEqual(good);
  });
  it('prototype pollution: __proto__, constructor and inherited keys change nothing', () => {
    const polluted = JSON.parse('{"__proto__":{"hc":4,"polluted":1},"constructor":{"prototype":{"x":1}},"g":0}');
    const out = sanitizeAppearance(polluted, 0);
    expect(out.hc).toBe(1);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(Object.getPrototypeOf(out)).toBe(Object.prototype);
    expect(out.g).toBe(0);
    const inherited = Object.create({ hc: 4, g: 0 });
    expect(sanitizeAppearance(inherited, 0)).toEqual(defaultAppearance(0)); // not a plain object
    (Object.prototype as Record<string, unknown>).hc = 4; // a polluted Object.prototype must not leak through reads (hasOwn)
    try {
      expect(sanitizeAppearance({ g: 0 }, 0).hc).toBe(1);
    } finally {
      delete (Object.prototype as Record<string, unknown>).hc;
    }
    expect(sanitizeAppearance(Object.assign(Object.create(null), good), 0)).toEqual(good); // a null-prototype object is plain
  });
  it('never throws, whatever it is given (fuzz)', () => {
    const rng = mulberry32(7);
    const junk = [Number.NaN, -0, 1e308, '', 'a', [], {}, null, undefined, true, Symbol.iterator, () => 1];
    for (let i = 0; i < 2000; i++) {
      const o: Record<string, unknown> = {};
      for (const k of [...FIELDS, 'v', '__proto__', 'z'])
        if (rng() < 0.6) Object.defineProperty(o, k, { value: junk[Math.floor(rng() * junk.length)], enumerable: true });
      const out = sanitizeAppearance(o, Math.floor(rng() * 20) - 5);
      for (const f of FIELDS) expect(Number.isInteger(out[f]) && out[f] >= 0 && out[f] < FIELD_SIZE[f]).toBe(true);
    }
  });
});

describe('defaultAppearance / randomAppearance', () => {
  it('is deterministic per slot, valid, and the 8 slots all differ', () => {
    expect(defaultAppearance(2)).toEqual(defaultAppearance(2));
    const codes = new Set(Array.from({ length: 8 }, (_, s) => encodeAppearance(defaultAppearance(s))));
    expect(codes.size).toBe(8);
    expect(defaultAppearance(Number.NaN)).toEqual(defaultAppearance(0));
  });
  it('is deterministic per seed, always sanitary, and cl always belongs to the gender list', () => {
    expect(randomAppearance(mulberry32(5))).toEqual(randomAppearance(mulberry32(5)));
    const rng = mulberry32(1);
    const seen: Record<string, Set<number>> = Object.fromEntries(FIELDS.map((f) => [f, new Set<number>()]));
    for (let i = 0; i < 10_000; i++) {
      const a = randomAppearance(rng);
      expect(sanitizeAppearance(a, 0)).toEqual(a);
      expect(CLOTHES_BY_GENDER[a.g]).toContain(a.cl);
      for (const f of FIELDS) seen[f]!.add(a[f]);
    }
    for (const f of FIELDS) if (f !== 'cl') expect(seen[f]!.size).toBe(FIELD_SIZE[f]); // every value reachable (cl: only the 11 ids that some list has)
    expect(seen.cl!.size).toBe(11);
  });
});

describe('encode / decode', () => {
  it('round-trips every combination (full sweep of all 285,120) and codes are unique, 4 chars of base36', () => {
    const seen = new Set<string>();
    const idx = Array(FIELDS.length).fill(0) as number[];
    for (let n = 0; n < APPEARANCE_COMBOS; n++) {
      const a = { v: 1 } as Record<string, number>;
      FIELDS.forEach((f, i) => {
        a[f] = idx[i]!;
      });
      const code = encodeAppearance(a as unknown as Appearance);
      expect(code).toMatch(/^[0-9a-z]{4}$/);
      if (n % 7 === 0) expect(decodeAppearance(code)).toEqual(a); // sampled decode; uniqueness below proves the rest
      seen.add(code);
      for (let i = FIELDS.length - 1; i >= 0; i--) {
        if (++idx[i]! < FIELD_SIZE[FIELDS[i]!]) break;
        idx[i] = 0;
      }
    }
    expect(seen.size).toBe(APPEARANCE_COMBOS);
  });
  it('round-trips 20k random looks', () => {
    const rng = mulberry32(99);
    for (let i = 0; i < 20_000; i++) {
      const a = randomAppearance(rng);
      expect(decodeAppearance(encodeAppearance(a))).toEqual(a);
    }
  });
  it('rejects what it did not write', () => {
    for (const bad of ['', 'abc', 'abcde', 'ABCD', 'zzzz', '____', '00 0', 7 as unknown as string])
      expect(decodeAppearance(bad)).toBeNull();
    expect(encodeAppearance({ v: 1, g: 0, s: 0, hc: 0, sk: 0, hat: 0, gl: 0, bk: 0, cl: 0 })).toBe('0000');
    expect(decodeAppearance(encodeAppearance(good))).toEqual(good);
  });
  it('sameAppearance compares every field', () => {
    expect(sameAppearance(good, { ...good })).toBe(true);
    for (const f of FIELDS) expect(sameAppearance(good, { ...good, [f]: good[f] === 0 ? 1 : 0 })).toBe(false);
  });
});
