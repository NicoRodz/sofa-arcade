// PR6 flag off = master 9ad24e0 (PR4) bit for bit. The numbers below were computed on master with the loop below (every other flag on, cards of all ten kinds put in hands and
// played) and are pinned here: comparing two rounds of this code would not notice a hash that drifted away from master.
import { describe, expect, it } from 'vitest';
import { mulberry32 } from '@pichi/core';
import { KINDS, PLUS_KINDS, createManchazo, hashManchazo, stepManchazo } from '../../sim';
import { scripts } from '../match-drive';

const MASTER: Record<number, { hashes: number[]; used: number; counts: number[] }> = {
  3: { hashes: [2787300730, 139846225, 2513339269, 1998470180, 633805046, 3564849779, 3136320187, 2860419685], used: 18, counts: [92, 63] },
  4242: { hashes: [670812129, 2374843814, 1170424104, 3767734318, 2490989473, 828477090, 3133139111, 116763], used: 18, counts: [78, 83] },
  99991: {
    hashes: [1436726935, 373078386, 1141262405, 2031656713, 3275878097, 32876539, 1857260268, 1319796230],
    used: 18,
    counts: [89, 60],
  },
};

function run(mapSeed: number, v2: boolean) {
  const s = createManchazo({
    slots: [0, 1, 2, 3, 4, 5],
    teams: [0, 1, 0, 1, 0, 1],
    seed: 9,
    mapSeed,
    classicMap: true,
    sabotage: true,
    sabotagePlus: true,
    projectiles: true,
    rescue: true,
    events: true,
    eventsPlus: true,
    phases: true,
    living: true,
    ...(v2 ? { sabotageV2: true } : {}),
  });
  const all = [...KINDS, ...PLUS_KINDS];
  const ps = scripts(6, 77);
  const use = s.grid.bodies.map((_b, i) => mulberry32(77 * 31 + i * 17));
  const hashes = [hashManchazo(s)];
  for (let t = 1; t <= 1500; t++) {
    if (t % 60 === 0 && !s.match.sab!.held[(t / 60) % 6]) s.match.sab!.held[(t / 60) % 6] = all[(t / 60) % 10]!;
    stepManchazo(s, new Map(ps.map((p, i) => [s.grid.bodies[i]!.slot, { ...p(), use: use[i]!() < 1 / 40 }])));
    if (t % 250 === 0 || t === 1499) hashes.push(hashManchazo(s));
  }
  return { s, hashes };
}

describe('sabotageV2 off is master (pinned from 9ad24e0)', () => {
  it.each(Object.keys(MASTER).map(Number))(
    'map seed %i: the hash tick by tick, the cards played and the counts equal the master ones',
    (mapSeed) => {
      const { s, hashes } = run(mapSeed, false);
      expect(s.match.sab!.plus!.wrap).toBeNull();
      expect(hashes).toEqual(MASTER[mapSeed]!.hashes);
      expect(s.match.sab!.used).toBe(MASTER[mapSeed]!.used);
      expect(s.match.counts).toEqual(MASTER[mapSeed]!.counts);
    },
  );
  it('with the flag on the round is another round (the rules changed), and it replays: same seed, same hashes', () => {
    const a = run(3, true);
    expect(a.s.match.sab!.plus!.wrap).not.toBeNull();
    expect(a.hashes).not.toEqual(MASTER[3]!.hashes);
    expect(run(3, true).hashes).toEqual(a.hashes);
  });
  it('the flag needs sabotagePlus: without it nothing is created', () => {
    const s = createManchazo({ slots: [0, 1], teams: [0, 1], seed: 3, sabotage: true, sabotageV2: true });
    expect(s.match.sab!.plus).toBeNull();
  });
});
