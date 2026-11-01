// Star fractions by team size: fraction of bot runs reaching 1, 2 and 3 stars per map x N (real lobby configuration).
//   npx tsx tools/hazards/stars-byn.ts [--maps 11,13] [--ns 2,3,4,6,8] [--difficulty normal] [--seeds 12]
import { seriesRound } from '../carta-larga/bot';
import { lobbyExtra } from './lobby-config';
import { SERIES_MAPS, fixedMap } from '@pichi/game-pizzas/sim/maps';
import { recipeStarFactor } from '@pichi/game-pizzas/sim/recipes/stars';
import { stars } from '@pichi/game-pizzas/sim/stars';
import { OIL } from '@pichi/game-pizzas/sim/mech/oil/state';
import type { Game } from '@pichi/game-pizzas/sim/round/state';
import type { Difficulty } from '@pichi/core/difficulty';

/** The janitor of stars-calibrate.ts: one oil tile wiped every 1.5 s (the bot does not clean oil itself). */
const wipe = (t: { n: number }) => (g: Game) => {
  t.n++;
  if (t.n % 90 !== 0 || !g.mech?.tile) return;
  const i = g.mech.tile.indexOf(OIL);
  if (i >= 0) g.mech.tile[i] = 0;
};
const args = process.argv.slice(2);
const flag = (n: string, d: string) => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1]! : d);
const diffs = flag('difficulty', 'normal').split(',') as Difficulty[];
const seeds = Number(flag('seeds', '12'));
const ids = flag('maps', '11,13,14,22').split(',');
const nsWanted = flag('ns', '2,3,4,6,8').split(',').map(Number);
for (const d of diffs)
  for (const id of ids) {
    const m = fixedMap(id)!;
    const series = SERIES_MAPS.some((s) => s.id === id);
    for (const n of nsWanted) {
      if (n < m.nMin || n > m.nMax) continue;
      const c = [0, 0, 0, 0];
      const sc: number[] = [];
      for (let seed = 1; seed <= seeds; seed++) {
        const L = lobbyExtra(id, d, series, seed * 7919 + 13);
        const g = seriesRound({ mapId: id, difficulty: d, n, seed, extra: L.extra, before: wipe({ n: 0 }) });
        c[stars(id, d, n, g.score, recipeStarFactor(g))]!++;
        sc.push(g.score);
      }
      const p = (k: number) => Math.round((100 * c.slice(k).reduce((a, b) => a + b, 0)) / seeds);
      sc.sort((a, b) => a - b);
      console.log(JSON.stringify({ map: id, d, n, seeds, s1: p(1), s2: p(2), s3: p(3), medScore: sc[Math.floor(seeds / 2)] }));
    }
  }
