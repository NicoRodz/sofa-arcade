// Bot sweep of 'beltReverse' (design section 8): 20 seeds x N in {2, 4, 8}; N=2 at least one star every time, no stall over 30 s, and the belts really flipped.
import { describe, expect, it } from 'vitest';
import { beltAssist, newBeltBot } from '../../../../../tools/carta-larga/mech/beltReverse';
import { playMech } from '../gate/play';
import { BELT_ROWS } from './map';

describe('mech.beltReverse bot', () => {
  for (const n of [2, 4, 8])
    it(`N=${n}: ${n === 2 ? 'at least 1 star on every seed, ' : ''}no stall over 30 s`, () => {
      for (let seed = 1; seed <= 20; seed++) {
        const st = newBeltBot();
        const r = playMech({ rows: BELT_ROWS, n, seed, mech: ['beltReverse'], assist: (g, c) => beltAssist(g, c, st) });
        const tag = `seed ${seed}: ${r.stars} stars, score ${r.score}, stall ${r.stall}, flips ${st.flips}`;
        expect(r.stall, tag).toBeLessThan(1800);
        expect(st.flips, tag).toBeGreaterThanOrEqual(2);
        if (n === 2) expect(r.stars, tag).toBeGreaterThanOrEqual(1);
      }
    });
});
