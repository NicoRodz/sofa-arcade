// F8a flag off = F5 bit for bit. The numbers below were computed on master eb50ca6 (before the five new sabotages existed) with the loop below and are pinned
// here: comparing two rounds of this code would not notice a hash that drifted away from master. Cards of the v1 five are put in hands so they are played.
import { describe, expect, it } from 'vitest';
import { mulberry32 } from '@pichi/core';
import { KINDS, createManchazo, hashManchazo, stepManchazo } from '../../sim';
import { scripts } from '../match-drive';

/** Round hash of 6 players (sabotage + events + living, no sabotagePlus) at tick 0, every 250 ticks up to 1500, and at 1499, per map seed. */
const F5_HASHES: Record<number, { hashes: number[]; used: number; counts: number[] }> = {
  3: {
    hashes: [1206329826, 2382081195, 1095044078, 3237676917, 2765352785, 1753022071, 3517357106, 1417720485],
    used: 13,
    counts: [79, 78],
  },
  4242: {
    hashes: [3224226066, 543761242, 1765875895, 1141952343, 2316730941, 1958752435, 1445363712, 1329311444],
    used: 12,
    counts: [61, 86],
  },
  99991: {
    hashes: [3896086963, 3384877917, 2483181287, 969599208, 2842783227, 943876726, 19362690, 1976488333],
    used: 13,
    counts: [75, 73],
  },
};

describe('sabotagePlus off is F5 (pinned from master eb50ca6)', () => {
  it.each(Object.keys(F5_HASHES).map(Number))(
    'map seed %i: the hash tick by tick, the cards played and the counts equal the master ones',
    (mapSeed) => {
      const want = F5_HASHES[mapSeed]!;
      const s = createManchazo({
        slots: [0, 1, 2, 3, 4, 5],
        teams: [0, 1, 0, 1, 0, 1],
        seed: 9,
        mapSeed,
        classicMap: true,
        sabotage: true,
        events: true,
        living: true,
      });
      expect(s.match.sab!.plus).toBeNull();
      const ps = scripts(6, 77);
      const use = s.grid.bodies.map((_b, i) => mulberry32(77 * 31 + i * 17));
      const got = [hashManchazo(s)];
      for (let t = 1; t <= 1500; t++) {
        if (t % 100 === 0 && !s.match.sab!.held[(t / 100) % 6]) s.match.sab!.held[(t / 100) % 6] = KINDS[(t / 100) % 5]!;
        stepManchazo(s, new Map(ps.map((p, i) => [s.grid.bodies[i]!.slot, { ...p(), use: use[i]!() < 1 / 60 }])));
        if (t % 250 === 0 || t === 1499) got.push(hashManchazo(s));
      }
      expect(got).toEqual(want.hashes);
      expect(s.match.sab!.used).toBe(want.used);
      expect(s.match.counts).toEqual(want.counts);
    },
  );
  it('the deck without the flag is the v1 five, the same as before; with it, 6 of the 10', () => {
    const off = createManchazo({ slots: [0, 1], teams: [0, 1], seed: 12, sabotage: true }).match.sab!;
    expect([...off.deck].sort()).toEqual([...KINDS].sort());
    const on = createManchazo({ slots: [0, 1], teams: [0, 1], seed: 12, sabotage: true, sabotagePlus: true }).match.sab!;
    expect(on.deck).toHaveLength(6);
    expect(new Set(on.deck).size).toBe(6);
  });
});
