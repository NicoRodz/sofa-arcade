// Bot sweep of 'gate' (design section 8): 20 seeds x N in {2, 4, 8} on the test map; with N=2 at least one star every time, and never a 30 s stall.
import { describe, expect, it } from 'vitest';
import { gateAssist, newGateBot } from '../../../../../tools/carta-larga/mech/gate';
import { playMech } from './play';
import { GATE_ROWS } from './map';

const SEEDS = Array.from({ length: 20 }, (_v, i) => i + 1);
describe('mech.gate bot', () => {
  for (const n of [2, 4, 8])
    it(`N=${n}: ${n === 2 ? 'at least 1 star on every seed, ' : ''}no stall over 30 s`, () => {
      const rows: string[] = [];
      for (const seed of SEEDS) {
        const st = newGateBot();
        const r = playMech({ rows: GATE_ROWS, n, seed, mech: ['gate'], assist: (g, c, t) => gateAssist(g, c, st, t) });
        rows.push(`seed ${seed}: ${r.stars} stars, score ${r.score}, delivered ${r.delivered}, stall ${r.stall}, wait ${st.waitTicks}`);
        expect(r.stall, rows.at(-1)).toBeLessThan(1800);
        if (n === 2) expect(r.stars, rows.at(-1)).toBeGreaterThanOrEqual(1);
      }
      if (process.env.PG_VERBOSE) console.log(`N=${n}\n${rows.join('\n')}`);
    });
});
