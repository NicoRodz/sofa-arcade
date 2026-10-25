// The rounds with the magnetism on (feel/magnet.ts) are pinned like the other coop goldens: same bots, same seeds, a fixture each, recorded on purpose
// (`npx tsx tools/record-golden.ts`). The six older fixtures never set the flag and stay as they were: the control here proves the flag is what moves a round.
import { describe, expect, it } from 'vitest';
import { MAGNET_SCENARIOS, RULES_SCENARIOS, SCENARIOS, runGolden, type GoldenRun } from './golden/bot';
import a from './golden/coop-n2-map2-normal-magnet.json';
import b from './golden/coop-n4-map9-hard-magnet.json';
import c from './golden/coop-n6-map11-easy-magnet.json';

const FIXTURES: Record<string, GoldenRun> = { [a.name]: a, [b.name]: b, [c.name]: c };

describe('coop golden rounds with the magnetism on', () => {
  it('every scenario has its fixture and sets the flag; the older scenarios never do', () => {
    expect(Object.keys(FIXTURES).sort()).toEqual(MAGNET_SCENARIOS.map((s) => s.name).sort());
    expect(MAGNET_SCENARIOS.every((s) => !!s.flags?.magnet)).toBe(true);
    expect([...SCENARIOS, ...RULES_SCENARIOS].every((s) => !s.flags?.magnet)).toBe(true);
    expect(MAGNET_SCENARIOS.map((s) => s.flags!.magnet)).toEqual([true, true, 'strong']); // both levels
  });
  it('the first fixture is a round with the gentle rat: it announces its counter, is scared off and the team is paid', () => {
    const types = a.events.map((e) => e.split('|')[1]);
    expect(types).toContain('rat:appear');
    expect(types).toContain('rat:target');
    expect(types.filter((t) => t === 'rat:scared')).toHaveLength(1);
    expect(a.events.find((e) => e.includes('|rat:scared|'))).toContain('"bonus":50');
  });
  for (const sc of MAGNET_SCENARIOS) {
    it(`${sc.name}: the whole event sequence matches the fixture, and it is not the round without the flag`, () => {
      const want = FIXTURES[sc.name]!;
      expect(want.delivered).toBeGreaterThan(0);
      expect(want.events.length).toBeGreaterThan(500);
      const got = runGolden(sc);
      const { events: ge, ...gr } = got,
        { events: we, ...wr } = want;
      expect(gr).toEqual(wr);
      expect(ge).toEqual(we);
      const plain = runGolden({ ...sc, flags: sc.flags && { ...sc.flags, magnet: false } });
      expect(plain.events).not.toEqual(ge); // the control: same bots, same seed, flag off
    });
  }
});
