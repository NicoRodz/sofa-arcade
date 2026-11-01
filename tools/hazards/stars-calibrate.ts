// Star calibration under the configuration the coop lobby really plays (games/pizzas/screen/match/round.ts startCoop): patchMap (HAZARD_V3 rows and mechanics), roundRules, hazardsV3, eventsV2, menuV2,
// the Carta larga flags, the mutation and the surfaces; with the capable scripted chefs of tools/carta-larga/bot.ts (measurement tool: nothing in the game imports it).
//   npx tsx tools/hazards/stars-calibrate.ts [--maps 1,2,20] [--difficulty normal,hard] [--seeds 24]
// Per map x difficulty: N = nMin / mid / nMax x seeds; metric = score / (teamFactor(N) x card factor), the unit of the E2 table. `base` = the configuration E2 was last calibrated under (PR #5: roundRules
// and HAZARD_V2 only, the original map, no menuV2 / eventsV2 / hazardsV3); `real` = the lobby now. Output: one JSON line per map x difficulty with the median and the spread (p25-p75 of the runs, the
// spread of the three per-N medians, the two half-sample medians, and a 90% bootstrap interval of the median) so a noisy row shows as noisy.
//   Carta larga maps (20-28): E2 = 0.6 x median(real), the method of stars.ts. Classics (1-15): their E2 came from a formula, not from a bot, so E2 keeps its meaning by the ratio median(real) / median(base).
// (No base run for them.) A bot that cannot play a map (no kneading, no oil wiping, see tools/hazards/patches-play.slow.test.ts) gives a 0 that is not a measure: `playable` is false and the row stays as it is.
// The janitor (`wipe`) is the chef of patches-play.slow.test.ts that wipes one oil tile every 1.5 s (what a chef holding B does); it only acts on a map with oil.
import { seriesRound } from '../carta-larga/bot';
import { lobbyExtra } from './lobby-config';
import { SERIES_MAPS, fixedMap } from '@pichi/game-pizzas/sim/maps';
import { OIL } from '@pichi/game-pizzas/sim/mech/oil/state';
import { roundRules } from '@pichi/game-pizzas/sim/midround';
import { e2, teamFactor } from '@pichi/game-pizzas/sim/stars';
import { recipeStarFactor } from '@pichi/game-pizzas/sim/recipes/stars';
import type { Game } from '@pichi/game-pizzas/sim/round/state';
import type { Difficulty } from '@pichi/core/difficulty';

const args = process.argv.slice(2);
const flag = (n: string, d: string) => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1]! : d);
const diffs = flag('difficulty', 'normal,hard').split(',') as Difficulty[];
const seeds = Number(flag('seeds', '24'));
const ids = flag('maps', '1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,20,21,22,23,24,25,26,27,28').split(',');
const q = (a: number[], p: number) => [...a].sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(p * a.length))] ?? Number.NaN;
const med = (a: number[]) => q(a, 0.5);
const r0 = (x: number) => Math.round(x);

/** The configuration of PR #5, the one E2 was calibrated under. */
const baseExtra = (d: Difficulty, series: boolean) => ({
  ...roundRules(undefined, d),
  ...(series ? {} : { adaptive: false, upgradeOrders: false, sliceAfterBake: false, compoundOrders: false }),
});
/** The chef that wipes oil: every 90 ticks one oil tile goes (a chef holding B at it). */
const wipe = (t: { n: number }) => (g: Game) => {
  t.n++;
  if (t.n % 90 !== 0 || !g.mech?.tile) return;
  const i = g.mech.tile.indexOf(OIL);
  if (i >= 0) g.mech.tile[i] = 0;
};
/** 90% bootstrap interval of the median of `a` (deterministic: a fixed LCG). */
function boot(a: number[]): [number, number] {
  let s = 12345;
  const rnd = () => (s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 2 ** 32;
  const m = Array.from({ length: 400 }, () => med(a.map(() => a[Math.floor(rnd() * a.length)]!)));
  return [r0(q(m, 0.05)), r0(q(m, 0.95))];
}

for (const d of diffs)
  for (const id of ids) {
    const m = fixedMap(id)!;
    const series = SERIES_MAPS.some((s) => s.id === id);
    const ns = [...new Set([m.nMin, Math.round((m.nMin + m.nMax) / 2), m.nMax])];
    const play = (real: boolean) => {
      const runs: number[] = [],
        byN: number[] = [];
      for (const n of ns) {
        const cell: number[] = [];
        for (let seed = 1; seed <= seeds; seed++) {
          const L = lobbyExtra(id, d, series, seed * 7919 + 13);
          const g = seriesRound({
            mapId: id,
            difficulty: d,
            n,
            seed,
            extra: real ? L.extra : baseExtra(d, series),
            before: wipe({ n: 0 }),
          });
          cell.push(g.score / (teamFactor(n) * recipeStarFactor(g)));
        }
        runs.push(...cell);
        byN.push(r0(med(cell)));
      }
      return { runs, byN };
    };
    const b = series ? { runs: [Number.NaN], byN: [] as number[] } : play(false); // a Carta larga row is absolute (0.6 x real): no base run
    const r = play(true);
    const mb = med(b.runs),
      mr = med(r.runs);
    const half = (a: number[], k: number) => med(a.filter((_v, i) => i % 2 === k)); // runs go by N then seed, seeds is even: odd/even seeds
    console.log(
      JSON.stringify({
        map: id,
        series,
        d,
        ns,
        seeds,
        old: e2(id, d),
        base: r0(mb),
        real: r0(mr),
        playable: mr >= 100,
        ratio: +(mr / mb).toFixed(3),
        p25: r0(q(r.runs, 0.25)),
        p75: r0(q(r.runs, 0.75)),
        ci90: boot(r.runs),
        byN: r.byN,
        halves: [r0(half(r.runs, 0)), r0(half(r.runs, 1))],
        baseByN: b.byN,
        seriesE2: Math.round((0.6 * mr) / 10) * 10,
      }),
    );
  }
