// The rounds with the new rules on (oven that burns, fire, events) are pinned exactly like the three original coop goldens: same bots, same seeds, a fixture each.
// Re-record on purpose: `npx tsx tools/record-golden.ts`. The original three live in coop.golden.test.ts and never set a flag.
import { describe, expect, it } from 'vitest';
import { RULES_SCENARIOS, SCENARIOS, runGolden, type GoldenRun } from './golden/bot';
import a from './golden/coop-n2-map2-normal-rules.json';
import b from './golden/coop-n4-map2-hard-rules.json';
import c from './golden/coop-n6-map11-normal-rules.json';

const FIXTURES: Record<string, GoldenRun> = { [a.name]: a, [b.name]: b, [c.name]: c };
const count = (r: GoldenRun, type: string) => r.events.filter((e) => e.split('|')[1] === type).length;

describe('coop golden rounds with the new rules on', () => {
  it('every scenario has its fixture, all with a flag on, and none of the original three has one', () => {
    expect(Object.keys(FIXTURES).sort()).toEqual(RULES_SCENARIOS.map((s) => s.name).sort());
    expect(RULES_SCENARIOS.every((s) => s.flags && Object.values(s.flags).some(Boolean))).toBe(true);
    expect(SCENARIOS.every((s) => s.flags === undefined)).toBe(true);
  });
  it('the fixtures cover what they are for: a pizza that burns, a fire that jumps, a pizza rescued, an event of each kind that shows (rat, rush, blackout), a round with deliveries', () => {
    expect(count(b, 'oven:burnt')).toBeGreaterThanOrEqual(1);
    expect(count(b, 'fire:start')).toBe(1);
    expect(count(b, 'fire:spread')).toBeGreaterThanOrEqual(1);
    expect(count(b, 'oven:rescued')).toBeGreaterThanOrEqual(1);
    expect(count(c, 'fire:start')).toBe(1);
    expect(count(c, 'fire:spread')).toBeGreaterThanOrEqual(2);
    const kind = (r: GoldenRun) =>
      r.events
        .find((e) => e.split('|')[1] === 'event:start')!
        .split('"kind":"')[1]!
        .split('"')[0];
    expect([kind(a), kind(b), kind(c)]).toEqual(['rat', 'rush', 'blackout']);
    for (const r of [a, b, c]) {
      expect(count(r, 'event:announce')).toBe(1);
      expect(count(r, 'event:start')).toBe(1);
      expect(count(r, 'event:end')).toBe(1);
    }
    expect(count(a, 'rat:steal')).toBe(1);
    expect(count(a, 'rat:gone')).toBe(1);
    for (const r of [a, b, c]) expect(r.delivered).toBeGreaterThan(0);
  });
  for (const sc of RULES_SCENARIOS) {
    it(`${sc.name}: score, counters, final chefs and the whole event sequence match the fixture`, () => {
      const want = FIXTURES[sc.name]!;
      const got = runGolden(sc);
      const { events: ge, ...gr } = got,
        { events: we, ...wr } = want;
      expect(gr).toEqual(wr);
      expect(ge).toEqual(we);
    });
  }
});
