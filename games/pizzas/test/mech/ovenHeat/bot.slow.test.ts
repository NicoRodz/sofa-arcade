// Bot sweep of 'ovenHeat' (design section 8): 20 seeds x N in {2, 4, 8}; N=2 at least one star every time, no stall over 30 s.
import { describe, expect, it } from 'vitest';
import { heatAssist, newHeatBot } from '../../../../../tools/carta-larga/mech/ovenHeat';
import { playMech } from '../gate/play';
import { HEAT_ROWS } from './map';

describe('mech.ovenHeat bot', () => {
  for (const n of [2, 4, 8])
    it(`N=${n}: ${n === 2 ? 'at least 1 star on every seed, ' : ''}no stall over 30 s`, () => {
      for (let seed = 1; seed <= 20; seed++) {
        const st = newHeatBot();
        const r = playMech({ rows: HEAT_ROWS, n, seed, mech: ['ovenHeat'], assist: (g, c) => heatAssist(g, c, st) });
        const tag = `seed ${seed}: ${r.stars} stars, score ${r.score}, stall ${r.stall}, min temp ${st.minTemp}, cold loads ${st.coldLoads}`;
        expect(r.stall, tag).toBeLessThan(1800);
        expect(st.minTemp, tag).toBeLessThan(1000); // the mechanic was really in play
        if (n === 2) expect(r.stars, tag).toBeGreaterThanOrEqual(1);
      }
    });
});
