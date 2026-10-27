// A generated map is a map you can play: the scripted team (test/mech/kneader/bot.ts: dough through M, a chef feeds W) plays a generated map for each mechanic the generator places, 3 seeds x N in {2, 4}.
// It must not crash or deadlock the sim (the hash of two runs agrees) and, with the kneader or the wood oven (the two the scripted team knows), it must deliver. The other mechanics only need to run.
import { describe, expect, it } from 'vitest';
import { GEN_MECHS, generateMech } from '../../../sim/gen/core';
import { playMech } from '../kneader/bot';

describe.each(GEN_MECHS)('generated %s map', (m) => {
  for (const n of [2, 4]) {
    it(`N=${n}: the scripted team plays it, deterministic`, () => {
      for (const seed of [1, 2, 3]) {
        const r = generateMech({ seed, n, difficulty: 'normal', mechanics: [m] });
        if (r.fallback) continue;
        const flags = Object.fromEntries(r.mechanics.map((id) => [id, true]));
        const a = playMech({ rows: r.rows, mech: flags, n, seed });
        const b = playMech({ rows: r.rows, mech: flags, n, seed });
        expect(a.g.mech?.hash).toBe(b.g.mech?.hash);
        expect(a.score).toBe(b.score);
        if (m === 'kneader' || m === 'woodOven') expect(a.delivered, `${m} n${n} seed${seed}`).toBeGreaterThan(0);
      }
    });
  }
});
