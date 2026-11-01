// Before/after of HAZARD_V2 with the scripted chefs (same seeds, `hazardsV2` false vs true). Measurement tool: nothing in the game imports it.
//   npx tsx tools/hazards/measure.ts rat|ice|fire|score [--v2 false] [--seeds 40] [--difficulty normal] [--tune '{"rat":{"touchRadius":0.4}}'] [--maps 2,9,11] [--ns 2,4] [--events false] [--split true]
// --tune patches HAZARD_V2[difficulty] in this process only (deep merge), for scans.
import { COUNTDOWN_MS, TICK_MS, addPlayer, createGame, tick, type Controls } from '@pichi/game-pizzas/sim/overcooked';
import { FIXED_MAPS, fixedMap, isFloor } from '@pichi/game-pizzas/sim/maps';
import { HAZARD_V2 } from '@pichi/game-pizzas/sim/hazards/hazard-v2';
import { roundRules } from '@pichi/game-pizzas/sim/rules/midround';
import { runRat } from '@pichi/game-pizzas/sim/feel/rat-bot';
import type { Sim } from '@pichi/game-pizzas/sim/feel/human-bot';
import type { Difficulty } from '@pichi/core/difficulty';
import { assignFire, chefControls, newFight } from './firefight';
import { runFire, runIce } from './micro';
import { newMem } from './mem';

const args = process.argv.slice(2);
const flag = (n: string, d?: string) => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1] : d);
const metric = args[0] ?? 'rat';
const v2 = flag('v2', 'true') !== 'false';
const seeds = Number(flag('seeds', '40'));
const diff = flag('difficulty', 'normal') as Difficulty;
const merge = (a: any, b: any) => {
  for (const k of Object.keys(b)) typeof b[k] === 'object' ? merge(a[k], b[k]) : (a[k] = b[k]);
};
if (flag('tune')) merge(HAZARD_V2[diff], JSON.parse(flag('tune')!));
const pct = (n: number, d: number) => (d ? (100 * n) / d : NaN).toFixed(1);
const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
const med = (a: number[]) => {
  const s = [...a].sort((x, y) => x - y);
  return s.length ? s[Math.floor(s.length / 2)]! : NaN;
};
const opts = { hazardsV2: v2 };

if (metric === 'rat') {
  const sim: Sim = { createGame, addPlayer, tick, isFloor, maps: FIXED_MAPS.slice(0, 15) } as Sim;
  const rows = [];
  for (let mi = 0; mi < sim.maps.length; mi++)
    for (let s = 1; s <= seeds; s++) {
      const r = await runRat(sim, mi, s, { difficulty: diff, magnet: true, ...opts });
      if (r) rows.push(r);
    }
  const c = (f: (r: (typeof rows)[0]) => boolean) =>
    (rows.filter(f).filter((r) => r.caught).length / Math.max(1, rows.filter(f).length)) * 100;
  console.log(
    `rat v2=${v2} ${diff} events ${rows.length} caught ${c(() => true).toFixed(1)}%  hands-free ${c((r) => !r.carry).toFixed(1)}%  hands-full ${c((r) => r.carry).toFixed(1)}%  stole ${pct(rows.filter((r) => r.stolen).length, rows.length)}%`,
  );
} else if (metric === 'ice') {
  const rs = Array.from({ length: seeds * 5 }, (_v, i) => runIce(i + 1, diff as 'normal', opts));
  console.log(
    `ice v2=${v2} ${diff} n ${rs.length} mean ${mean(rs.map((r) => r.ms)).toFixed(0)} ms  median ${med(rs.map((r) => r.ms)).toFixed(0)} ms  overshoot>=1 tile ${pct(rs.filter((r) => r.overshoot >= 1).length, rs.length)}%  not done ${pct(rs.filter((r) => !r.done).length, rs.length)}%`,
  );
} else if (metric === 'fire') {
  const map = flag('map', '11')!;
  for (const n of [1, 2]) {
    const rs = Array.from({ length: seeds * 5 }, (_v, i) => runFire(map, n, i + 1, diff as 'normal', opts)).filter((r) => !!r);
    const f = (x: boolean | null) => rs.filter((r) => x === null || r!.big === x);
    const line = (name: string, set: typeof rs) =>
      `${name} n=${set.length} out med ${(med(set.map((r) => r!.outMs)) / 1000).toFixed(1)} s  end med ${(med(set.map((r) => r!.endMs)) / 1000).toFixed(1)} s  unresolved(60s) ${pct(set.filter((r) => !r!.resolved).length, set.length)}%`;
    console.log(
      `fire v2=${v2} ${diff} map ${map} chefs ${n}: big ${pct(f(true).length, rs.length)}% | ${line('small', f(false))} | ${line('big', f(true))}`,
    );
  }
} else if (metric === 'score') {
  const maps = flag('maps', '2,9,11')!.split(',');
  const ns = flag('ns', '2,4')!.split(',').map(Number);
  for (const mapId of maps)
    for (const n of ns) {
      const sc: number[] = [],
        big: number[] = [],
        split = new Map<string, number[]>(),
        byKind = new Map<string, number[]>(),
        stealRounds: number[] = [];
      for (let seed = 1; seed <= seeds; seed++) {
        const m = fixedMap(mapId)!;
        const g = createGame({
          mapId,
          rows: m.rows,
          spawns: m.spawns,
          difficulty: diff,
          n,
          seed,
          countdownMs: COUNTDOWN_MS,
          ...roundRules(undefined, diff),
          ...(flag('events') ? { events: flag('events') !== 'false' } : {}),
          recipes: false,
          ...opts,
        });
        const ids = Array.from({ length: n }, (_v, i) => i + 1);
        ids.forEach((id, rank) => addPlayer(g, id, rank, rank));
        const mem = new Map(ids.map((id) => [id, newMem()]));
        const fight = newFight();
        let t = 0,
          fires = 0;
        const kinds: string[] = [];
        let steals = 0;
        g.bus.on('event:start', (e) => kinds.push(e.kind));
        g.bus.on('rat:steal', () => steals++);
        g.bus.on('fire:start', (e) => {
          fires++;
          if (e.big) big.push(1);
        });
        const limit = Math.ceil((COUNTDOWN_MS + g.params.roundMs) / TICK_MS) + 60;
        while (!g.over && t < limit) {
          const plan = assignFire(g, fight);
          const c = new Map<number, Controls>();
          ids.forEach((id, rank) => c.set(id, chefControls(g, g.players.get(id)!, rank, mem.get(id)!, t, plan.get(id))));
          tick(g, c);
          t++;
        }
        sc.push(g.score);
        void fires;
        const bonus = kinds.some((k) => k === 'rush' || k === 'birthday' || k === 'inspector');
        const cls = kinds.length === 0 ? 'none' : bonus ? 'bonus' : 'hazards-only';
        split.set(cls, [...(split.get(cls) ?? []), sc[sc.length - 1]!]);
        for (const k of new Set(kinds)) if (!bonus) byKind.set(k, [...(byKind.get(k) ?? []), sc[sc.length - 1]!]);
        stealRounds.push(kinds.includes('rat') ? steals : -1);
      }
      console.log(
        `score v2=${v2} ${diff} map ${mapId} N=${n} mean ${mean(sc).toFixed(0)}  median ${med(sc).toFixed(0)}  min ${Math.min(...sc)}  max ${Math.max(...sc)}  big fires ${big.length}`,
      );
      if (flag('split')) {
        const f = (m: Map<string, number[]>) =>
          [...m]
            .sort()
            .map(([k, v]) => `${k} n=${v.length} mean ${mean(v).toFixed(0)}`)
            .join(' | ');
        const rr = stealRounds.filter((x) => x >= 0);
        console.log(
          `  by class: ${f(split)}\n  by kind (hazards-only rounds containing it): ${f(byKind)}\n  rat rounds ${rr.length}: steals/round ${mean(rr).toFixed(2)}`,
        );
      }
    }
}
