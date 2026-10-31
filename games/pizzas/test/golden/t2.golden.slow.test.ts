// The rounds the lobby plays with HAZARD_V3 on (tanda 2, PR-B): the patched map, the V3 numbers, the expired-order penalty and the rat that takes an item. Same bots and seeds as the other coop goldens, a fixture each,
// recorded on purpose (`npx tsx tools/record-golden.ts`). The older fixtures never set `hazardsV3` and stay byte for byte: the control here proves the flag (and the patch) is what moves a round.
import { describe, expect, it } from 'vitest';
import { T2_SCENARIOS, runGolden, type GoldenRun } from './bot';
import f0 from './fixtures/coop-n4-map10-normal-t2.json';
import f1 from './fixtures/coop-n6-map10-hard-t2.json';
import f2 from './fixtures/coop-n5-map13-normal-t2.json';
import f3 from './fixtures/coop-n8-map13-hard-t2.json';
import f4 from './fixtures/coop-n4-map22-normal-t2.json';
import f5 from './fixtures/coop-n8-map22-hard-t2.json';
import f6 from './fixtures/coop-n4-map31-normal-t2.json';
import f7 from './fixtures/coop-n8-map31-hard-t2.json';

const FIXTURES: Record<string, GoldenRun> = { [f0.name]: f0, [f1.name]: f1, [f2.name]: f2, [f3.name]: f3, [f4.name]: f4, [f5.name]: f5, [f6.name]: f6, [f7.name]: f7 };

describe('coop golden rounds with HAZARD_V3 on', () => {
  it('every scenario has its fixture, sets the flag, and the four maps of the design come in Normal and Hard', () => {
    expect(Object.keys(FIXTURES).sort()).toEqual(T2_SCENARIOS.map((s) => s.name).sort());
    expect(T2_SCENARIOS.every((s) => s.flags?.hazardsV3 === true)).toBe(true);
    for (const m of ['10', '13', '22', '31']) expect(T2_SCENARIOS.filter((s) => s.mapId === m).map((s) => s.difficulty).sort()).toEqual(['hard', 'normal']);
  });
  it('the fixtures show the new rules at work: orders expire (the penalty), the rat takes an item on one round, the bridge breaks on the Taller', () => {
    expect(Object.values(FIXTURES).every((f) => f.expired > 0)).toBe(true);
    const steals = Object.values(FIXTURES).flatMap((f) => f.events.filter((e) => e.includes('|rat:steal|')));
    expect(steals.length).toBeGreaterThanOrEqual(1);
    expect(FIXTURES['coop-n8-map31-hard-t2']!.events.some((e) => e.includes('|mech:bridgeBreak|'))).toBe(true);
  });
  for (const sc of T2_SCENARIOS) {
    it(`${sc.name}: the whole event sequence matches the fixture, and it is not the round without the flag`, () => {
      const want = FIXTURES[sc.name]!;
      expect(want.events.length).toBeGreaterThan(500);
      const got = runGolden(sc);
      const { events: ge, ...gr } = got,
        { events: we, ...wr } = want;
      expect(gr).toEqual(wr);
      expect(ge).toEqual(we);
      const plain = runGolden({ ...sc, flags: sc.flags && { ...sc.flags, hazardsV3: false } });
      expect(plain.events).not.toEqual(ge); // the control: same bots, same seed, flag off (and the unpatched map)
    });
  }
});
