// The validator of 'bridge': the test map, a bridge that is not over water, and a bridge that is the only way across.
import { describe, expect, it } from 'vitest';
import { bridgeValidate } from '../../../sim/validate/mech/bridge';
import { BRIDGE_ROWS } from './map';

describe('bridgeValidate', () => {
  it('the test map is fine; a map with no bridge is not its business', () => {
    for (const n of [2, 4, 8]) expect(bridgeValidate(BRIDGE_ROWS, n)).toEqual([]);
    expect(bridgeValidate([], 2)).toEqual([]);
  });
  it('a b on dry land is refused', () => {
    const rows = BRIDGE_ROWS.map((r, y) => (y === 5 ? '#b.....~.......#' : r));
    expect(bridgeValidate(rows, 2).join()).toMatch(/b at \(1, 5\) is not over water/);
  });
  it('a river that only the bridge crosses is refused (the top row closed)', () => {
    const rows = BRIDGE_ROWS.map((r, y) => (y === 1 || y === 7 ? r.slice(0, 7) + '~' + r.slice(8) : r));
    expect(bridgeValidate(rows, 2).join()).toMatch(/without it no region/);
  });
});
