import { FIELDS, CLOTHES_BY_GENDER, defaultAppearance, type Appearance } from '@pichi/core';
import { mulberry32 } from '@pichi/core/rng';
import { describe, expect, it } from 'vitest';
import { MIN_DIFF, diffCount, duplicateOf, randomAvoiding } from './similar';

const A = (o: Partial<Appearance> = {}): Appearance => ({ ...defaultAppearance(3), ...o });

describe('duplicates', () => {
  it('names someone else with exactly the same look, never the player itself', () => {
    const me = A();
    expect(duplicateOf(me, [{ id: 1, name: 'Yo', ap: me }], 1)).toBeNull();
    expect(duplicateOf(me, [{ id: 2, name: 'Ana', ap: { ...me } }], 1)).toBe('Ana');
    expect(duplicateOf(me, [{ id: 2, name: 'Ana', ap: { ...me, hat: (me.hat + 1) % 6 } }], 1)).toBeNull();
    expect(duplicateOf(me, [{ id: 2, name: 'Ana' }], 1)).toBeNull(); // a player with no look yet
  });
  it('cuts a long name so the notice fits', () => {
    expect(duplicateOf(A(), [{ id: 2, name: 'WWWWWWWWWWWWWWWW', ap: A() }], 1)).toBe('WWWWWWWWWW…');
  });
});

describe('Aleatorio', () => {
  it('differs from everybody in >= 3 fields when the roster allows it', () => {
    const rng = mulberry32(7);
    const others = Array.from({ length: 7 }, (_, i) => defaultAppearance(i + 10));
    for (let i = 0; i < 200; i++) {
      const a = randomAvoiding(rng, others, null);
      for (const o of others) expect(diffCount(a, o)).toBeGreaterThanOrEqual(MIN_DIFF);
    }
  });
  it('keeps the chosen gender and takes the clothes from that gender list', () => {
    const rng = mulberry32(9);
    for (let i = 0; i < 300; i++) {
      const g = i % 3;
      const a = randomAvoiding(rng, [], g);
      expect(a.g).toBe(g);
      expect(CLOTHES_BY_GENDER[g]).toContain(a.cl);
    }
  });
  it('with no gender chosen every gender shows up, and every field value stays in range', () => {
    const rng = mulberry32(11);
    const seen = new Set<number>();
    for (let i = 0; i < 300; i++) {
      const a = randomAvoiding(rng, [], null);
      seen.add(a.g);
      for (const f of FIELDS) expect(Number.isInteger(a[f])).toBe(true);
    }
    expect(seen.size).toBe(3);
  });
  it('an impossible roster still returns a valid look (the best of its tries)', () => {
    const rng = mulberry32(5);
    const wall = Array.from({ length: 300 }, (_, i) => defaultAppearance(i));
    expect(randomAvoiding(rng, wall, 1).g).toBe(1);
  });
});
