// Regression of the A5 phase (plan §8 "B no rompe A", applied to A5): nothing the campaign had before may move.
//  1. QUICK MATCH: the hash of every level of the 15, in both modes it allows, with 2 and 4 players, after 900 steps of scripted noise, is FROZEN. The values below were taken on
//     master (32e6aa2, before A5) and are byte for byte the same after it: the layer is opt-in and none of the six new dynamics leaks into a world without `campaign`.
//  2. CAMPAIGN WORLDS ON THE OLD LEVELS: the bodies' fingerprint (positions, deaths, status) of the same runs in the Playa and Glaciar worlds is frozen for every run in which
//     nobody throws. A run that throws changed ON PURPOSE (the throw niche: faster launch and a rope that stretches), so those runs are not frozen here; the niche has its own tests.
import { describe, expect, it } from 'vitest';
import { LEVELS } from '../levels';
import { hashBodies } from './player';
import { createWorld, hashState, step } from './world';

const noise = (seed = 7) => {
  let r = seed;
  return () => {
    r = (r * 1664525 + 1013904223) >>> 0;
    return r / 2 ** 32;
  };
};
const run = (lv: (typeof LEVELS)[number], mode: 'chain' | 'free', n: number, campaign?: { world: 'beach' | 'glacier' }) => {
  const slots = Array.from({ length: n }, (_, i) => i);
  const w = createWorld({ level: lv, mode, difficulty: 'normal', slots, ...(campaign ? { campaign } : {}) });
  const rnd = noise();
  let throws = 0;
  for (let i = 0; i < 900; i++) {
    const inputs = slots.map(() => ({
      move: [-1, 0, 1, 1][Math.floor(rnd() * 4)]! * (i % 90 < 70 ? 1 : 0),
      down: rnd() < 0.05,
      up: false,
      jump: rnd() < 0.05,
      grab: rnd() < 0.02,
    }));
    throws += step(w, inputs).filter((e) => e.name === 'obst.throw').length;
  }
  return { w, throws };
};
const modesOf = (t: string) =>
  t === 'chainOnly' ? ['chain' as const] : t === 'freeOnly' ? ['free' as const] : ['chain' as const, 'free' as const];

const QUICK = [
  'l01 chain n=2 3943193544 3 playing',
  'l01 chain n=4 2859357416 0 playing',
  'l01 free n=2 1498211655 3 playing',
  'l01 free n=4 3144788739 3 playing',
  'l02 chain n=2 345240198 4 playing',
  'l02 chain n=4 667242970 12 failed',
  'l02 free n=2 1077103368 4 playing',
  'l02 free n=4 1311826806 8 playing',
  'l03 chain n=2 859270891 3 playing',
  'l03 chain n=4 1939427482 7 playing',
  'l03 free n=2 2939886432 7 playing',
  'l03 free n=4 2875517652 8 playing',
  'l04 chain n=2 1965009163 2 playing',
  'l04 chain n=4 302620887 2 playing',
  'l04 free n=2 3799170461 1 playing',
  'l04 free n=4 2439455760 4 playing',
  'l05 chain n=2 1139975005 8 playing',
  'l05 chain n=4 2846148583 12 failed',
  'l05 free n=2 1522888290 7 playing',
  'l05 free n=4 2586695073 12 failed',
  'l06 chain n=2 2424184495 0 playing',
  'l06 chain n=4 3390786246 0 playing',
  'l06 free n=2 3031550173 0 playing',
  'l06 free n=4 1633638262 0 playing',
  'l07 chain n=2 1994763714 0 playing',
  'l07 chain n=4 4055678271 0 playing',
  'l07 free n=2 1567739440 0 playing',
  'l07 free n=4 2982820487 0 playing',
  'l08 free n=2 4081889151 0 playing',
  'l08 free n=4 2130813080 0 playing',
  'l09 chain n=2 2786780182 6 playing',
  'l09 chain n=4 725874738 12 failed',
  'l09 free n=2 1563590014 6 playing',
  'l09 free n=4 1575882303 5 playing',
  'l10 chain n=2 2957582043 10 playing',
  'l10 chain n=4 2194067572 9 playing',
  'l10 free n=2 3579978708 7 playing',
  'l10 free n=4 2034514539 12 failed',
  'l11 chain n=2 3171151099 2 playing',
  'l11 chain n=4 2568132950 4 playing',
  'l11 free n=2 3569649639 3 playing',
  'l11 free n=4 460806695 4 playing',
  'l12 chain n=2 101303439 20 playing',
  'l12 chain n=4 1964516587 12 failed',
  'l12 free n=2 2807439187 15 playing',
  'l12 free n=4 2788563301 33 failed',
  'l13 chain n=2 1277754206 4 playing',
  'l13 chain n=4 2954827474 12 failed',
  'l13 free n=2 4202903555 6 playing',
  'l13 free n=4 924633459 12 failed',
  'l14 chain n=2 2016969653 11 playing',
  'l14 chain n=4 3322285598 12 failed',
  'l15 chain n=2 300077018 0 playing',
  'l15 chain n=4 1763269507 0 playing',
  'l15 free n=2 1600228349 0 playing',
  'l15 free n=4 602862600 0 playing',
];
const CAMPAIGN = [
  'l01 chain beach 2004462330 4 playing',
  'l01 chain glacier 2650304304 2 playing',
  'l01 free beach 1998399367 4 playing',
  'l01 free glacier 1022777879 5 playing',
  'l02 chain beach 1014091050 7 playing',
  'l02 chain glacier 58114999 7 playing',
  'l02 free beach 3765022918 4 playing',
  'l02 free glacier 4241889043 4 playing',
  'l03 chain glacier 4241010058 4 playing',
  'l03 free beach 36171698 3 playing',
  'l03 free glacier 782911362 5 playing',
  'l04 chain beach 2654249474 4 playing',
  'l04 chain glacier 564753170 5 playing',
  'l04 free beach 527805467 1 playing',
  'l04 free glacier 1962940327 2 playing',
  'l05 chain beach 3812955672 10 playing',
  'l05 chain glacier 855792303 9 playing',
  'l05 free beach 2173405155 9 playing',
  'l05 free glacier 924289024 12 playing',
  'l06 free beach 1442725766 0 playing',
  'l06 free glacier 1442725766 0 playing',
  'l07 free beach 3632218555 0 playing',
  'l07 free glacier 1319531049 0 playing',
  'l08 free beach 1678749551 0 playing',
  'l08 free glacier 1678749551 0 playing',
  'l09 chain beach 4040102395 2 playing',
  'l09 chain glacier 2340548016 2 playing',
  'l10 free beach 3035072379 10 playing',
  'l10 free glacier 2848072542 8 playing',
  'l11 free beach 2005767959 4 playing',
  'l11 free glacier 3711346980 3 playing',
  'l12 chain beach 2102356475 13 playing',
  'l12 chain glacier 3468515957 4 playing',
  'l12 free beach 968630172 10 playing',
  'l12 free glacier 3613663010 3 playing',
  'l13 free beach 3284621584 4 playing',
  'l13 free glacier 3949055880 5 playing',
  'l14 chain beach 2252391871 6 playing',
  'l14 chain glacier 666939899 17 playing',
  'l15 free beach 1768917211 0 playing',
  'l15 free glacier 599341446 0 playing',
];

describe('A5 regression: what existed before does not move', () => {
  it('quick match: the hash of the 15 levels (2 and 4 players, both modes) after 900 noisy steps is the one master had', () => {
    const got: string[] = [];
    for (const lv of LEVELS)
      for (const mode of modesOf(lv.tether))
        for (const n of [2, 4]) {
          const { w } = run(lv, mode, n);
          got.push(`${lv.id} ${mode} n=${n} ${hashState(w)} ${w.deaths} ${w.status}`);
        }
    expect(got).toEqual(QUICK);
  });
  it('campaign worlds on the old levels: the bodies of every run without a throw are the ones master had (Playa and Glaciar)', () => {
    const got: string[] = [];
    for (const lv of LEVELS)
      for (const mode of modesOf(lv.tether))
        for (const world of ['beach', 'glacier'] as const) {
          const { w, throws } = run(lv, mode, 2, { world });
          if (throws === 0) got.push(`${lv.id} ${mode} ${world} ${hashBodies(w.players.map((p) => p.body))} ${w.deaths} ${w.status}`);
        }
    expect(got).toEqual(CAMPAIGN);
  });
});
