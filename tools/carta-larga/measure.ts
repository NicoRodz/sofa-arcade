// Difficulty of the Carta larga series (maps 20-28) with the scripted recipe chefs (tools/carta-larga/bot.ts = recipe-bot.ts + the topping-crate bind: a tidy, never-late team, so it is a ceiling of what
// a good team makes, not a human). Normal, the series' flags (adaptive pacing, upgrades, compound orders), N = nMin / mid / nMax, 3 seeds.
//   npx tsx tools/carta-larga/measure.ts [--seeds 3] [--maps 20,21] [--difficulty normal] [--json file]
import { writeFileSync } from 'node:fs';
import { seriesRound } from './bot';
import { fixedMap } from '@pichi/game-pizzas/sim/maps';
import { cardFor } from '@pichi/game-pizzas/sim/recipes/cards';
import { summarize } from '@pichi/game-pizzas/sim/results';
import type { Difficulty } from '@pichi/core/difficulty';
import type { Game } from '@pichi/game-pizzas/sim/round/state';

const args = process.argv.slice(2);
const flag = (n: string) => args[args.indexOf(`--${n}`) + 1];
const has = (n: string) => args.includes(`--${n}`);
const seeds = has('seeds') ? Number(flag('seeds')) : 3;
const ids = has('maps') ? flag('maps')!.split(',') : ['20', '21', '22', '23', '24', '25', '26', '27', '28'];
const difficulty = (has('difficulty') ? flag('difficulty') : 'normal') as Difficulty;

export interface Row {
  map: string;
  n: number;
  seed: number;
  served: number;
  expired: number;
  rejected: number;
  score: number;
  stars: number;
  thresholds: [number, number, number];
  idlePct: number;
  byRecipe: Record<string, number>;
}
export function measure(mapId: string, n: number, seed: number, d: Difficulty = difficulty): Row {
  const byRecipe: Record<string, number> = {};
  let seen: { id: number; recipe: string; expiresAt: number }[] = [],
    prevDelivered = 0,
    prevTime = 0,
    idle = 0,
    ovenTicks = 0;
  const credit = (g: Game) => {
    if (g.delivered > prevDelivered) {
      const now = new Set(g.teams[0]!.orders.map((o) => o.id));
      for (const o of seen) if (!now.has(o.id) && o.expiresAt > prevTime) byRecipe[o.recipe] = (byRecipe[o.recipe] ?? 0) + 1;
    }
    prevDelivered = g.delivered;
    prevTime = g.time;
    seen = g.teams[0]!.orders.map((o) => ({ id: o.id, recipe: o.recipe, expiresAt: o.expiresAt }));
  };
  const g = seriesRound({
    mapId,
    difficulty: d,
    n,
    seed,
    before: (gg) => {
      if (gg.time <= 0) return; // countdown
      credit(gg);
      for (const s of gg.stations)
        if (s.kind === 'pot') {
          ovenTicks++;
          if (!s.inputs.length && !s.done && !s.item) idle++;
        }
    },
  });
  credit(g);
  const sm = summarize(g);
  return {
    map: mapId,
    n,
    seed,
    served: g.delivered,
    expired: g.expired,
    rejected: g.rejected,
    score: g.score,
    stars: sm.stars,
    thresholds: sm.thresholds,
    idlePct: ovenTicks ? (100 * idle) / ovenTicks : 0,
    byRecipe,
  };
}

const avg = (a: number[]) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);
export function report(): Row[] {
  const all: Row[] = [];
  console.log(
    'map name           N  served expired  score  stars thresholds     oven-idle%  recipes served (sum over seeds; card: * = never)',
  );
  for (const id of ids) {
    const m = fixedMap(id)!;
    const card = cardFor(id)!.recipes;
    const ns = [...new Set([m.nMin, Math.round((m.nMin + m.nMax) / 2), m.nMax])];
    for (const n of ns) {
      const rows = Array.from({ length: seeds }, (_v, i) => measure(id, n, i + 1));
      all.push(...rows);
      const tot: Record<string, number> = {};
      for (const r of rows) for (const [k, v] of Object.entries(r.byRecipe)) tot[k] = (tot[k] ?? 0) + v;
      const rec = card.map((r) => `${r}${tot[r] ? ':' + tot[r] : '*'}`).join(' ');
      const th = rows[0]!.thresholds.join('/');
      console.log(
        `${id.padEnd(3)} ${m.name.slice(0, 15).padEnd(15)} ${String(n).padStart(2)} ${avg(rows.map((r) => r.served))
          .toFixed(1)
          .padStart(6)} ${avg(rows.map((r) => r.expired))
          .toFixed(1)
          .padStart(7)} ${avg(rows.map((r) => r.score))
          .toFixed(0)
          .padStart(6)} ${rows
          .map((r) => r.stars)
          .join(',')
          .padStart(6)}  ${th.padEnd(14)} ${avg(rows.map((r) => r.idlePct))
          .toFixed(0)
          .padStart(6)}      ${rec}`,
      );
    }
  }
  return all;
}
if (process.argv[1]?.endsWith('carta-larga/measure.ts')) {
  const rows = report();
  if (has('json')) writeFileSync(flag('json')!, JSON.stringify(rows));
}
