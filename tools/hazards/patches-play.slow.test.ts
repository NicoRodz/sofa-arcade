// The HAZARD_V3 patches leave their maps playable by a person, not only by the carta-larga bot (whose MechBot are stubs: it never kneads on M and never wipes oil, so it scores 0 on map 12 and little on 10/14/15 Hard).
//  - Map 12 (kneader): the scripted pairing team of the kneader tests (games/pizzas/test/mech/kneader/bot.ts: dough crate -> M with two chefs -> oven -> window) delivers on the patched rows.
//  - Maps 10, 14, 15 (oil) in Hard: the carta-larga team plus a "janitor" that wipes one oil tile every 1.5 s (what a chef holding B does) delivers; map 15 needs it (its only door between the ovens and
//    the windows is the tile the drip reaches, and a plate dropped there is only dropped once per 30 s).
import { describe, expect, it } from 'vitest';
import { seriesRound } from '../carta-larga/bot';
import { playMech } from '../../games/pizzas/test/mech/kneader/bot';
import { fixedMap } from '@pichi/game-pizzas/sim/maps';
import { patchMap } from '@pichi/game-pizzas/sim/maps/hazard-patches';
import { mechFlagsOf } from '@pichi/game-pizzas/sim/mech/ids';
import { OIL } from '@pichi/game-pizzas/sim/mech/oil/state';
import { usesSurfaces } from '@pichi/game-pizzas/sim/surfaces/legend';
import { roundRules } from '@pichi/game-pizzas/sim/midround';

describe('HAZARD_V3 patched maps are playable', () => {
  it('12: the kneader pairing team delivers on the patched rows (N=5 and 8, 3 seeds each)', () => {
    const m = patchMap(fixedMap('12')!, 'normal');
    for (const n of [5, 8])
      for (const seed of [1, 2, 3]) {
        const r = playMech({ rows: m.rows, mech: mechFlagsOf(m.mechanics), n, seed });
        expect(r.delivered, `n=${n} seed=${seed}`).toBeGreaterThan(0);
      }
  });
  for (const id of ['10', '14', '15']) {
    it(`${id} Hard: with a chef that wipes the oil, a round delivers (3 seeds)`, () => {
      const m = fixedMap(id)!;
      const pm = patchMap(m, 'hard');
      for (let seed = 1; seed <= 3; seed++) {
        let t = 0;
        const g = seriesRound({
          mapId: id,
          difficulty: 'hard',
          n: m.nMin + 1,
          seed,
          extra: {
            ...roundRules(undefined, 'hard'),
            menuV2: true,
            rows: pm.rows,
            mech: mechFlagsOf(pm.mechanics),
            surfaces: usesSurfaces(pm.rows),
            hazardsV3: true,
          },
          before: (gg) => {
            t++;
            if (t % 90 !== 0 || !gg.mech?.tile) return;
            const i = gg.mech.tile.findIndex((v) => v === OIL);
            if (i >= 0) gg.mech.tile[i] = 0;
          },
        });
        expect(g.delivered, `seed=${seed}`).toBeGreaterThan(0);
      }
    });
  }
});
