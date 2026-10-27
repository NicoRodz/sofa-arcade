// The multi-state validator: before and after are both checked; a mutation that breaks the kitchen is refused with the side it breaks.
import { describe, expect, it } from 'vitest';
import { multistateProblems } from '../../../sim/validate/multistate';
import type { MapDef } from '../../../sim/maps';
import { MUT, MUT_ROWS } from './map';

const map = (over: Partial<MapDef> = {}): MapDef => ({
  id: 'mut-test',
  name: 'mut',
  rows: MUT_ROWS,
  nMin: 2,
  nMax: 2,
  minDuro: 1,
  stars: 1,
  mechanics: ['mutation'],
  mutation: MUT,
  ...over,
});

describe('multistateProblems', () => {
  it('a map with no mutation is not its business', () => {
    expect(multistateProblems(map({ mutation: undefined }))).toEqual([]);
  });
  it('the test map is valid before and after', () => {
    expect(multistateProblems(map())).toEqual([]);
  });
  it('an op list that cannot apply is reported without running the validators', () => {
    expect(multistateProblems(map({ mutation: { ...MUT, ops: [['move', [2, 4], [1, 2]]] } })).join()).toMatch(/plain floor/);
  });
  it('a change that seals the window off breaks the map after it, and says which side', () => {
    const walls = [
      ['tile', [13, 1], '#'],
      ['tile', [14, 2], '#'],
    ] as const;
    const out = multistateProblems(map({ mutation: { ...MUT, ops: walls as never } }));
    expect(out.length).toBeGreaterThan(0);
    expect(out.every((e) => e.startsWith('after:'))).toBe(true);
  });
});
