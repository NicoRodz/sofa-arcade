// The validator of 'heavyTray': the oven-to-window route without a bridge, and the Bandeja on the card of a map that declares it.
import { describe, expect, it } from 'vitest';
import { heavyTrayCardProblems, heavyTrayValidate } from '../../../sim/validate/mech/heavyTray';
import { COOP_MAPS } from '../../../sim/maps';
import { BRIDGE_ROWS } from '../bridge/map';

describe('heavyTrayValidate', () => {
  it('a map with a dry route from the oven to the window is fine; one with no oven or window is not its business', () => {
    for (const n of [2, 4, 8]) expect(heavyTrayValidate(BRIDGE_ROWS, n)).toEqual([]);
    expect(heavyTrayValidate([], 2)).toEqual([]);
  });
  it('a route that only the bridge crosses is refused (the dry ways closed)', () => {
    const rows = BRIDGE_ROWS.map((r, y) => (y === 1 || y === 7 ? r.slice(0, 7) + '~' + r.slice(8) : y === 4 ? r.replace('O....#', '.....#') : r)); // the only oven is on the left bank
    expect(heavyTrayValidate(rows, 2).join()).toMatch(/without a bridge/);
  });
  it('a map that declares heavyTray needs the Bandeja on its card; the others are not checked', () => {
    expect(heavyTrayCardProblems({ id: '28', mechanics: ['heavyTray'] })).toEqual([]);
    expect(heavyTrayCardProblems({ id: '3', mechanics: ['heavyTray'] }).join()).toMatch(/no Bandeja/);
    expect(heavyTrayCardProblems({ id: '3', mechanics: ['bridge'] })).toEqual([]);
    expect(heavyTrayCardProblems({ id: '3' })).toEqual([]);
  });
  it('every map of the catalog that declares it passes both checks', () => {
    for (const m of COOP_MAPS.filter((m) => m.mechanics?.includes('heavyTray'))) {
      expect(heavyTrayCardProblems(m), m.id).toEqual([]);
      expect(heavyTrayValidate(m.rows, m.nMax), m.id).toEqual([]);
    }
  });
});
