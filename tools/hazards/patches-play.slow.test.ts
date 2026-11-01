// The HAZARD_V3 patches leave their maps playable by a person, not only by the carta-larga bot (whose MechBot are stubs: it never kneads on M and never wipes oil, so it scores 0 on map 12 and little on 10/14/15 Hard).
//  - Map 12 (kneader): the scripted pairing team of the kneader tests (games/pizzas/test/mech/kneader/bot.ts: dough crate -> M with two chefs -> oven -> window) delivers on the patched rows.
//  - Maps 10, 14, 15 (oil) in Hard: the carta-larga team plus a "janitor" that wipes one oil tile every 1.5 s (what a chef holding B does) delivers; map 15 needs it (its only door between the ovens and
//    the windows is the tile the drip reaches, and a plate dropped there is only dropped once per 30 s).
import { describe, expect, it } from 'vitest';
import { seriesRound } from '../carta-larga/bot';
import { lobbyExtra } from './lobby-config';
import { ferryDrive, menderDrive, raftX } from './mech-drivers';
import { addPlayer, createGame, tick, type Controls } from '@pichi/game-pizzas/sim/overcooked';
import { playMech } from '../../games/pizzas/test/mech/kneader/bot';
import { fixedMap } from '@pichi/game-pizzas/sim/maps';
import { patchMap } from '@pichi/game-pizzas/sim/maps/hazard-patches';
import { mechFlagsOf } from '@pichi/game-pizzas/sim/mech/ids';
import { OIL } from '@pichi/game-pizzas/sim/mech/oil/state';
import { usesSurfaces } from '@pichi/game-pizzas/sim/surfaces/legend';
import { roundRules } from '@pichi/game-pizzas/sim/rules/midround';

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
            const i = gg.mech.tile.indexOf(OIL);
            if (i >= 0) gg.mech.tile[i] = 0;
          },
        });
        expect(g.delivered, `seed=${seed}`).toBeGreaterThan(0);
      }
    });
  }
  // Maps 30 and 31 carry bridges and 31 a raft with no patch of their own: the HAZARD_V3 rows (mend by hand, raft for two) change how they play, so a scripted chef that uses the mechanic must still deliver.
  for (const d of ['normal', 'hard'] as const) {
    it(`31 ${d}: a mender chef holding B mends the bridge and the round delivers (3 seeds)`, () => {
      const m = fixedMap('31')!;
      for (let seed = 1; seed <= 3; seed++) {
        const { extra } = lobbyExtra('31', d, true, seed);
        let mends = 0,
          wired = false;
        const n = m.nMin + 2;
        const g = seriesRound({
          mapId: '31',
          difficulty: d,
          n,
          seed,
          extra,
          drive: (gg, id) => (id === n ? menderDrive(gg, id) : null),
          before: (gg) => {
            if (wired) return;
            wired = true;
            gg.bus.on('mech:bridgeMend', () => mends++);
          },
        });
        expect(mends, `seed=${seed}: the bridge was mended by hand`).toBeGreaterThan(0);
        expect(g.delivered, `seed=${seed}`).toBeGreaterThan(0);
      }
    });
    it(`31 ${d}: three chefs take turns on the raft (it holds two) and all cross`, () => {
      const { extra } = lobbyExtra('31', d, true, 1);
      const g = createGame({
        mapId: '31',
        rows: extra.rows,
        mech: extra.mech,
        hazardsV3: true,
        difficulty: d,
        n: 3,
        countdownMs: 0,
        seed: 1,
      });
      [
        [5, 4],
        [4, 4],
        [4, 5],
      ].forEach(([x, y], i) => addPlayer(g, i + 1, i, i) && Object.assign(g.players.get(i + 1)!, { x: x! + 0.5, y: y! + 0.5 }));
      let most = 0,
        done = -1;
      const arrived: Record<number, number> = {};
      for (let t = 0; t < 3000 && done < 0; t++) {
        const c = new Map<number, Controls>([1, 2, 3].map((id) => [id, ferryDrive(g, id)]));
        tick(g, c);
        const rx = raftX(g);
        const on = [...g.players.values()].filter((p) => Math.floor(p.x) === rx && Math.floor(p.y) === 4).length;
        most = Math.max(most, on);
        for (const p of g.players.values()) if (p.x >= 11) arrived[p.id] ??= t;
        if ([...g.players.values()].every((p) => p.x >= 11)) done = t;
      }
      expect(most, 'never more than two on the raft').toBeLessThanOrEqual(2);
      // the lane of map 31 is one tile wide with water on both sides, so two chefs hardly fit side by side (0.7 apart in a 0.65 span): they cross in separate trips, a return trip (>200 ticks) apart
      expect(arrived[3]! - arrived[1]!, 'the third crossed in a later trip').toBeGreaterThan(200);
      expect(done, 'all three crossed').toBeGreaterThan(0);
    });
  }
});
