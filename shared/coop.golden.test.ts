// Coop regression net (the teams refactor of the sim must not move a single point or event): three full rounds with fixed
// seed and scripted inputs (golden/bot.ts) are compared exactly with fixtures recorded before the refactor.
// Re-record only on purpose: `npx tsx tools/record-golden.ts`.
import { describe, expect, it } from 'vitest';
import { SCENARIOS, runGolden, type GoldenRun } from './golden/bot';
import n2 from './golden/coop-n2-map2-normal.json';
import n4 from './golden/coop-n4-map9-hard.json';
import n6 from './golden/coop-n6-map11-easy.json';

const FIXTURES: Record<string, GoldenRun> = { [n2.name]: n2, [n4.name]: n4, [n6.name]: n6 };

describe('coop golden rounds', () => {
  it('covers 2, 4 and 6 players on three different maps', () => {
    expect(SCENARIOS.map((s) => s.n)).toEqual([2, 4, 6]);
    expect(new Set(SCENARIOS.map((s) => s.mapId)).size).toBe(3);
    expect(Object.keys(FIXTURES).sort()).toEqual(SCENARIOS.map((s) => s.name).sort());
  });
  for (const sc of SCENARIOS) {
    it(`${sc.name}: score, counters, final chefs and the whole event sequence match the fixture`, () => {
      const want = FIXTURES[sc.name]!;
      expect(want.delivered).toBeGreaterThan(0); // a golden that never delivers protects nothing
      expect(want.events.length).toBeGreaterThan(500);
      const got = runGolden(sc);
      const { events: gotEvents, ...gotRest } = got;
      const { events: wantEvents, ...wantRest } = want;
      expect(gotRest).toEqual(wantRest);
      expect(gotEvents).toEqual(wantEvents);
    });
  }
});
