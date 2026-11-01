// HAZARD_V3 before/after with the capable scripted chefs of tools/carta-larga/bot.ts (measurement tool: nothing in the game imports it). "before" = the rules master plays (no `hazardsV3`, the map as it
// is); "after" = what the lobby plays now (`hazardsV3`, `patchMap`, the mechanics flags). Both run menuV2 and roundRules, same seeds. Per map and N: median score / teamFactor, the fraction of ticks with an
// active hazard, the net points by source of the ledger, and the stars the median and the best seed reach with the card factor.
//   npx tsx tools/hazards/measure-v3.ts [--maps 10,12,13,14,15,22,27] [--difficulty normal] [--seeds 6] [--ns min,mid,max]
import { seriesRound } from '../carta-larga/bot';
import { SERIES_MAPS, fixedMap } from '@pichi/game-pizzas/sim/maps';
import { patchMap } from '@pichi/game-pizzas/sim/maps/hazard-patches';
import { mechFlagsOf } from '@pichi/game-pizzas/sim/mech/ids';
import { usesSurfaces } from '@pichi/game-pizzas/sim/surfaces/legend';
import { roundRules } from '@pichi/game-pizzas/sim/rules/midround';
import { starThresholds, teamFactor } from '@pichi/game-pizzas/sim/scoring/stars';
import { recipeStarFactor } from '@pichi/game-pizzas/sim/recipes/stars';
import type { Game } from '@pichi/game-pizzas/sim/round/state';
import type { Difficulty } from '@pichi/core/difficulty';

const args = process.argv.slice(2);
const flag = (n: string, d: string) => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1]! : d);
const diff = flag('difficulty', 'normal') as Difficulty;
const seeds = Number(flag('seeds', '6'));
const ids = flag('maps', '10,12,13,14,15,22,27').split(',');
const nsFlag = flag('ns', 'min,mid,max').split(',');
const med = (a: number[]) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)] ?? NaN;

/** A tick has an active hazard when oil, fire or water lies on a tile, a station burns, the belt runs reversed, or a non-bonus event (rat, blackout, frost, spill...) is in progress. */
function hazardActive(g: Game): boolean {
  if (g.mech?.tile?.some((v) => v !== 0)) return true;
  if (g.mech?.belt?.reversed) return true;
  if (g.stations.some((s) => (s as { fire?: number }).fire !== undefined)) return true;
  const m = g.mid;
  return !!m && m.phase === 'active' && !['rush', 'birthday', 'inspector'].includes(m.kind);
}

for (const id of ids) {
  const m = fixedMap(id)!;
  const series = SERIES_MAPS.some((s) => s.id === id);
  const pick = { min: m.nMin, mid: Math.round((m.nMin + m.nMax) / 2), max: m.nMax };
  const ns = [...new Set(nsFlag.map((k) => pick[k as 'min']))];
  for (const n of ns)
    for (const after of [false, true]) {
      const pm = after ? patchMap(m, diff) : m;
      const scores: number[] = [],
        act: number[] = [],
        raw: number[] = [],
        src: Record<string, number> = {};
      let thr: number[] = [];
      for (let seed = 1; seed <= seeds; seed++) {
        const flags = series ? {} : { adaptive: false, upgradeOrders: false, sliceAfterBake: false, compoundOrders: false };
        let on = 0,
          ticks = 0;
        const g = seriesRound({
          mapId: id,
          difficulty: diff,
          n,
          seed,
          extra: {
            ...roundRules(undefined, diff),
            ...flags,
            menuV2: true,
            ledger: true,
            rows: pm.rows,
            mech: mechFlagsOf(pm.mechanics),
            surfaces: usesSurfaces(pm.rows),
            mutation: pm.mutation,
            hazardsV3: after,
          },
          before: (gg) => {
            ticks++;
            if (hazardActive(gg)) on++;
          },
        });
        scores.push(g.score / teamFactor(n));
        act.push(on / Math.max(1, ticks));
        thr = starThresholds(id, diff, n, recipeStarFactor(g));
        raw.push(g.score);
        for (const [k, v] of Object.entries(g.ledger?.points ?? {})) src[k] = (src[k] ?? 0) + v / seeds;
      }
      const star = (s: number) => thr.filter((t) => s >= t).length;
      const srcTxt = Object.entries(src)
        .sort()
        .map(([k, v]) => `${k}=${v.toFixed(0)}`)
        .join(' ');
      console.log(
        `map ${id} N=${n} ${diff} ${after ? 'AFTER ' : 'BEFORE'} score/tf ${med(scores).toFixed(0)} active ${(100 * med(act)).toFixed(1)}% stars thr [${thr}] median ${star(med(raw))} best ${star(Math.max(...raw))} | ${srcTxt}`,
      );
    }
}
