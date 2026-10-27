// The Taller series (ids 29-36): curated maps of the new mechanics. Each one passes the base validator, the validator of every mechanic it declares (for 2..nMax chefs) and, when it moves stations, the
// multi-state one; has at most three mechanics, a spawn for every chef it asks for, and its own page in the lobby.
import { describe, expect, it } from 'vitest';
import { COOP_MAPS, TALLER_MAPS, groupOfMap, parseMap } from './maps';
import { validateMap } from './validate';
import { multistateProblems } from './validate/multistate';
import { mechFlagsOf } from './mech/ids';
import { mechModule } from './mech/registry';

describe('the Taller maps', () => {
  it('are the ids 29 to 36, in the coop pool and on their own lobby page', () => {
    expect(TALLER_MAPS.map((m) => m.id)).toEqual(['29', '30', '31', '32', '33', '34', '35', '36']);
    for (const m of TALLER_MAPS) {
      expect(COOP_MAPS).toContain(m);
      expect(groupOfMap(m.id)).toBe('taller');
    }
    expect(groupOfMap('24')).toBe('series');
    expect(groupOfMap('3')).toBe('classic');
  });
  for (const m of TALLER_MAPS) {
    it(`${m.id} ${m.name}: validates, its mechanics validate for 2..${m.nMax} chefs, at most three, a spawn for every chef`, () => {
      expect(validateMap(m)).toEqual({ ok: true, errors: [] });
      expect(() => parseMap(m.rows, false, mechFlagsOf(m.mechanics))).not.toThrow();
      expect(m.mechanics!.length).toBeGreaterThanOrEqual(1);
      expect(m.mechanics!.length).toBeLessThanOrEqual(3);
      expect(m.nMin).toBeLessThanOrEqual(m.nMax);
      expect(m.nMin).toBeGreaterThanOrEqual(2);
      for (let n = 2; n <= m.nMax; n++) {
        for (const id of m.mechanics!) expect(mechModule(id).validate(m.rows, n), `${id} n=${n}`).toEqual([]);
        expect(multistateProblems(m, n), `mutation n=${n}`).toEqual([]);
      }
      expect(m.rows.join('').split('S').length - 1).toBeGreaterThanOrEqual(m.nMax);
    });
  }
  it('35 moves stations (a v2 mutation declared in its mechanics); no other one mutates', () => {
    const mutating = TALLER_MAPS.filter((m) => m.mutation);
    expect(mutating.map((m) => m.id)).toEqual(['35']);
    expect(mutating[0]!.mechanics).toContain('mutation');
    expect(multistateProblems(mutating[0]!, 2)).toEqual([]);
  });
});
