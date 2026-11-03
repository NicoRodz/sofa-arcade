// Re-pinned for the fluid-turn movement (new base movement, flag off). Originally: F5 flag off = F4 bit for bit. The numbers below were computed on master 31646fc (F4, before the living map existed) and are pinned here: the flag-off
// test in round.test.ts only compares two rounds of this code, which would not notice a hash that drifted away from F4.
import { describe, expect, it } from 'vitest';
import { generateMap } from '../../map';
import { clockRow, createEvents, createManchazo, hashManchazo, stepManchazo } from '../../sim';
import { scripts } from '../match-drive';

/** Round hash of 6 players (sabotage + events, no living flag) at ticks 0, 250, ..., 1250 and at 1499, per map seed. */
const F4_HASHES: Record<number, number[]> = {
  3: [1057248940, 3794808291, 2663557358, 2207757784, 2308520254, 1961203324, 1484668128],
  5: [4050023540, 4284234824, 2313711958, 3969442206, 427884697, 1477849152, 1829283785],
  4242: [2949905110, 3439385014, 4014283275, 2401430000, 913316077, 2892758107, 2366747122],
  99991: [3763018333, 3775504955, 458288570, 1823492274, 2133657066, 1578359487, 354647463],
  1234567: [2235806071, 1855772226, 902374131, 974699051, 1036309626, 1740483499, 966546131],
};
const F4_EVENTS_DIGEST = 253227095;

describe('flag off is F4 (pinned from master 31646fc)', () => {
  it('the round hash tick by tick equals the F4 one, on 5 maps', () => {
    for (const [seed, want] of Object.entries(F4_HASHES)) {
      const s = createManchazo({
        slots: [0, 1, 2, 3, 4, 5],
        teams: [0, 1, 0, 1, 0, 1],
        seed: 9,
        mapSeed: Number(seed),
        classicMap: true,
        sabotage: true,
        events: true,
      });
      const p = scripts(6, 77);
      const got: number[] = [];
      for (let t = 0; t < 1500; t++) {
        stepManchazo(s, new Map(p.map((q, i) => [i, q()])));
        if (t % 250 === 0) got.push(hashManchazo(s));
      }
      got.push(hashManchazo(s));
      expect(got).toEqual(want);
    }
  });

  it('the Hourglass row and the event program (no fountain) equal the F4 ones, on 40 seeds', () => {
    let h = 0x811c9dc5;
    const mix = (str: string) => {
      for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 0x01000193);
    };
    for (const seed of Array.from({ length: 40 }, (_, i) => i * 7919 + 13)) {
      const { map } = generateMap(seed, undefined, false, false);
      mix(JSON.stringify(createEvents(map, seed, 4500)));
      mix(String(clockRow(map, seed)));
    }
    expect(h >>> 0).toBe(F4_EVENTS_DIGEST);
  });
});
