// Star calibration under the rules a lobby round plays by default (roundRules: burning oven, fire, events, magnet, pace) with the capable scripted chefs of tools/carta-larga/bot.ts
// (measurement tool: nothing in the game imports it). For each map: N = nMin / mid / nMax x seeds, metric = median of score / teamFactor(N), once with HAZARD_V2 and once without (the rules before PR #2).
//   npx tsx tools/hazards/stars-calibrate.ts [--maps 1,2,20] [--difficulty normal] [--seeds 6]
// Carta larga maps (20-28): E2 = 0.6 x median(v2), the method of stars.ts. Classics (1-15): their E2 came from a formula, not from a bot, so E2 keeps its meaning by the ratio median(v2) / median(v1).
import { seriesRound } from '../carta-larga/bot';
import { SERIES_MAPS, fixedMap } from '@pichi/game-pizzas/sim/maps';
import { roundRules } from '@pichi/game-pizzas/sim/midround';
import { e2, teamFactor } from '@pichi/game-pizzas/sim/stars';
import type { Difficulty } from '@pichi/core/difficulty';

const args = process.argv.slice(2);
const flag = (n: string, d: string) => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1]! : d);
const diff = flag('difficulty', 'normal') as Difficulty;
const seeds = Number(flag('seeds', '6'));
const ids = flag('maps', '1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,20,21,22,23,24,25,26,27,28').split(',');
const med = (a: number[]) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)] ?? NaN;

for (const id of ids) {
  const m = fixedMap(id)!;
  const series = SERIES_MAPS.some((s) => s.id === id);
  const ns = [...new Set([m.nMin, Math.round((m.nMin + m.nMax) / 2), m.nMax])];
  const run = (v2: boolean) => {
    const out: number[] = [];
    for (const n of ns)
      for (let seed = 1; seed <= seeds; seed++) {
        const flags = series ? {} : { adaptive: false, upgradeOrders: false, sliceAfterBake: false, compoundOrders: false };
        const g = seriesRound({ mapId: id, difficulty: diff, n, seed, extra: { ...roundRules(undefined, diff), ...flags, hazardsV2: v2 } });
        out.push(g.score / teamFactor(n));
      }
    return med(out);
  };
  const v1 = run(false),
    v2 = run(true);
  const old = e2(id, diff);
  console.log(
    JSON.stringify({ map: id, series, diff, old, v1: Math.round(v1), v2: Math.round(v2), ratio: +(v2 / v1).toFixed(3), seriesE2: Math.round((0.6 * v2) / 10) * 10 }),
  );
}
