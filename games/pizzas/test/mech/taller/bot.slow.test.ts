// Smoke of the Taller maps with the scripted team of the kneader (test/mech/kneader/bot.ts): it does not hang and serves at least one order with 2 and with 4 chefs.
// The bot knows the kneader only: on the maps with a gate or a wood oven it plays the plain recipe, so 30 is played by the gate bot with the W as a normal oven (the bot never blows the bellows).
import { describe, expect, it } from 'vitest';
import { TALLER_MAPS } from '../../../sim/maps';
import { mechFlagsOf } from '../../../sim/mech/ids';
import { gateAssist, newGateBot } from '../../../../../tools/carta-larga/mech/gate';
import { playMech } from '../kneader/bot';
import { playMech as playGate } from '../gate/play';

describe('bot on the Taller maps', () => {
  for (const m of TALLER_MAPS.filter((x) => x.id !== '30'))
    for (const n of [2, 4])
      it(`${m.id} ${m.name} N=${n}: serves at least one order and finishes`, () => {
        for (const seed of [1, 2]) {
          const r = playMech({ rows: m.rows, mech: mechFlagsOf(m.mechanics)!, n, seed, mutation: m.mutation });
          expect(r.g.over, `seed ${seed}`).toBe(true);
          expect(r.delivered, `seed ${seed}`).toBeGreaterThan(0);
        }
      });
  const m30 = TALLER_MAPS.find((x) => x.id === '30')!;
  for (const n of [2, 4])
    it(`30 ${m30.name} N=${n}: the gate bot (W as a normal oven) serves at least one order`, () => {
      const st = newGateBot();
      const rows = m30.rows.map((r) => r.replace('W', 'O').replace('Q', '.'));
      const r = playGate({ rows, n, seed: 1, mech: ['gate', 'bridge'], assist: (g, c, t) => gateAssist(g, c, st, t) });
      expect(r.delivered).toBeGreaterThan(0);
    });
});
