import { describe, expect, it } from 'vitest';
import { FIXED_MAPS } from '.';
import { SIGMAS, isometryCheck, type Sigma } from './symmetry';

// the V1 and V3 drawings of the design (legend of the design: '|' barrier, a/b starts), as plain strings
const V1 = [
  '#MTQ#HH||HH#QTM#',
  '=......||......=',
  'C......||......C',
  'C..==..||..==..C',
  '=..==..||..==..=',
  'P.a..a.||.b..b.P',
  'L.a..a.||.b..b.L',
  'B......||......B',
  '#==E==#||#==E==#',
];
const V3 = [
  '#MTQ=HH=CC=PL=B#',
  '=..............E',
  '=..a...a...a...=',
  '#==============#',
  '||||||||||||||||',
  '#==============#',
  '=...b...b...b..=',
  'E..............=',
  '#B=LP=CC=HH=QTM#',
];
const startsAsOne = (a: string, b: string) => (a === 'a' || a === 'b' ? 'S' : a) === (b === 'a' || b === 'b' ? 'S' : b);

describe('isometryCheck', () => {
  it('the design V1 is a perfect left-right mirror (s = 1) once a and b read as the same start', () => {
    const r = isometryCheck(V1, SIGMAS.mirrorX, startsAsOne);
    expect(r).toEqual({ valid: true, s: 1, mismatches: [] });
  });
  it('the design V3 is a perfect 180 degree rotation', () => {
    expect(isometryCheck(V3, SIGMAS.rot180, startsAsOne)).toEqual({ valid: true, s: 1, mismatches: [] });
  });
  it('without the start equivalence the a/b tiles are the only differences', () => {
    const r = isometryCheck(V1, SIGMAS.mirrorX);
    expect(r.s).toBeLessThan(1);
    expect(r.mismatches).toHaveLength(8); // 4 starts a + 4 starts b
    expect(r.mismatches.every(([x, y]) => 'ab'.includes(V1[y]![x]!))).toBe(true);
  });
  it('moving one station breaks it, and says which tiles disagree', () => {
    const rows = [...V1];
    rows[0] = '#MTT#HH||HH#QTM#'; // the Q at column 3 becomes a T
    const r = isometryCheck(rows, SIGMAS.mirrorX, startsAsOne);
    expect(r.s).toBeLessThan(1);
    expect(r.mismatches).toEqual([
      [3, 0],
      [12, 0],
    ]);
    expect(r.s).toBeCloseTo(1 - 2 / (16 * 9), 10);
  });
  it('the right sigma matters: V3 is not a left-right or top-bottom mirror', () => {
    expect(isometryCheck(V3, SIGMAS.mirrorX, startsAsOne).s).toBeLessThan(1);
    expect(isometryCheck(V3, SIGMAS.mirrorY, startsAsOne).s).toBeLessThan(1);
  });
  it('a sigma that is not an involution, or leaves the map, is reported invalid', () => {
    const shift: Sigma = (x, y) => [x + 1, y];
    expect(isometryCheck(V1, shift).valid).toBe(false);
    const wrap: Sigma = (x, y, w) => [(x + 1) % w, y]; // stays inside but is not its own inverse
    expect(isometryCheck(V1, wrap).valid).toBe(false);
    expect(isometryCheck(V1, SIGMAS.mirrorX).valid).toBe(true);
  });
  it('rejects maps that are not rectangles', () => {
    expect(() => isometryCheck(['##', '#'], SIGMAS.mirrorX)).toThrow(RangeError);
    expect(() => isometryCheck([], SIGMAS.mirrorX)).toThrow(RangeError);
  });
  it('measures the real maps: every fixed map gets an s between 0 and 1 and a valid sigma', () => {
    for (const m of FIXED_MAPS)
      for (const sigma of Object.values(SIGMAS)) {
        const r = isometryCheck(m.rows, sigma);
        expect(r.valid, m.id).toBe(true);
        expect(r.s, m.id).toBeGreaterThan(0);
        expect(r.s, m.id).toBeLessThanOrEqual(1);
      }
  });
});
