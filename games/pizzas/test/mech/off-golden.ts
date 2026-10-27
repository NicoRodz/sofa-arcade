// Shared by every games/pizzas/test/mech/<id>/off.test.ts: a mechanic whose flag is off leaves the round as it was (the recorded golden), and creates no `game.mech`.
// Test support only: nothing in the game imports it.
import { describe, expect, it } from 'vitest';
import { SCENARIOS, runGolden, type GoldenRun } from '../golden/bot';
import { createGame } from '../../sim/overcooked';
import type { MechId } from '../../sim/mech/ids';
import n2 from '../golden/fixtures/coop-n2-map2-normal.json';

const FIXTURE: GoldenRun = n2;

export function offIsGolden(id: MechId) {
  describe(`mech.${id} off`, () => {
    it('the round matches the golden fixture byte for byte', () => {
      const sc = SCENARIOS.find((s) => s.name === FIXTURE.name)!;
      const { events, ...rest } = runGolden({ ...sc, flags: { mech: { [id]: false } } });
      const { events: want, ...wantRest } = FIXTURE;
      expect(rest).toEqual(wantRest);
      expect(events).toEqual(want);
    });
    it('creates neither game.mech nor game.flags', () => {
      const g = createGame({ mech: { [id]: false } });
      expect('mech' in g).toBe(false);
      expect('flags' in g).toBe(false);
    });
  });
}
