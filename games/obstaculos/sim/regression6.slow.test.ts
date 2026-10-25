// Regression of the A6 phase (1-5 re-frozen after A5 S2 rebuilt it around the 5-tile pit; the other six levels are unchanged): Mundo 1 (the 7 campaign levels, Playa world) plays exactly as it did on master 4bb18b8 (before A6). The hash of every level after 1200 steps of scripted noise
// (two seeds, two players) is FROZEN here: A6 added lantern, elastic ring, sinkers and geyser, and none of it may leak into a world that does not use them (hashState mixes the A6 state only
// when it is not at rest). The quick-match hashes of the 15 levels are frozen in regression.test.ts and did not move either.
import { describe, expect, it } from 'vitest';
import { WORLD1 as WORLD1_LEVELS } from '../campaign/world1';
import { createWorld, hashState, step } from './world';

const noise = (seed: number) => {
  let r = seed;
  return () => {
    r = (r * 1664525 + 1013904223) >>> 0;
    return r / 2 ** 32;
  };
};
const WORLD1 = [
  '1-1 free s3 3425913049 0 playing',
  '1-1 free s11 2149430116 0 playing',
  '1-2 chain s3 1140154775 0 playing',
  '1-2 chain s11 3858361916 1 playing',
  '1-3 chain s3 1938091651 0 playing',
  '1-3 chain s11 1128839279 0 playing',
  '1-4 chain s3 3506783140 8 playing',
  '1-4 chain s11 3648383486 3 playing',
  '1-5 chain s3 4264498545 5 playing',
  '1-5 chain s11 3730486391 3 playing',
  '1-6 chain s3 3212456919 13 playing',
  '1-6 chain s11 2993711721 9 playing',
  '1-7 chain s3 3583523844 0 playing',
  '1-7 chain s11 1014992433 0 playing',
];

describe('A6 regression: Mundo 1 does not move', () => {
  it('the hash of the 7 levels of Mundo 1 (campaign Playa, 2 players, 2 seeds) after 1200 noisy steps is the one master had', () => {
    const got: string[] = [];
    for (const d of WORLD1_LEVELS)
      for (const seed of [3, 11]) {
        const mode = d.tether === 'freeOnly' ? 'free' : 'chain';
        const w = createWorld({ level: d, mode, difficulty: 'normal', slots: [0, 1], campaign: { world: 'beach' } });
        const rnd = noise(seed);
        for (let i = 0; i < 1200; i++) {
          const inputs = [0, 1].map(() => ({
            move: [-1, 0, 1, 1][Math.floor(rnd() * 4)]! * (i % 90 < 70 ? 1 : 0),
            down: rnd() < 0.05,
            up: rnd() < 0.05,
            jump: rnd() < 0.05,
            grab: rnd() < 0.02,
          }));
          step(w, inputs);
        }
        got.push(`${d.id} ${mode} s${seed} ${hashState(w)} ${w.deaths} ${w.status}`);
      }
    expect(got).toEqual(WORLD1);
  });
});
