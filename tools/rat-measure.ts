// How often the imperfect chef (shared/feel/rat-bot.ts) scares the mid-round rat inside its window, with the plain rat and with the gentle one.
//   npx tsx tools/rat-measure.ts [--seeds 12] [--opts '{"magnet":true}'] [--difficulty normal]
import { FIXED_MAPS, isFloor } from '../shared/maps';
import { addPlayer, createGame, tick } from '../shared/overcooked';
import { runRat } from '../shared/feel/rat-bot';
import type { Sim } from '../shared/feel/human-bot';

const args = process.argv.slice(2);
const flag = (n: string) => { const i = args.indexOf(`--${n}`); return i < 0 ? undefined : args[i + 1]; };
const seeds = Number(flag('seeds') ?? 12), opts = { difficulty: flag('difficulty') ?? 'normal', ...JSON.parse(flag('opts') ?? '{}') };
const sim: Sim = { createGame, addPlayer, tick, isFloor, maps: FIXED_MAPS.slice(0, 15) };
const rows = [];
for (let mi = 0; mi < sim.maps.length; mi++) for (let s = 1; s <= seeds; s++) { const r = await runRat(sim, mi, s, opts); if (r) rows.push(r); }
const caught = rows.filter((r) => r.caught), stolen = rows.filter((r) => r.stolen);
const med = (a: number[]) => { const v = [...a].sort((x, y) => x - y); return v.length ? v[Math.floor(v.length / 2)]! : NaN; };
for (const [name, set] of [['all', rows], ['hands free', rows.filter((r) => !r.carry)], ['hands full', rows.filter((r) => r.carry)]] as const) {
  const c = set.filter((r) => r.caught);
  console.log(`  ${name.padEnd(10)} events ${set.length}  caught ${(100 * c.length / set.length).toFixed(1)}%`);
}
console.log(JSON.stringify(opts), `events ${rows.length}  caught ${(100 * caught.length / rows.length).toFixed(1)}%  stole ${(100 * stolen.length / rows.length).toFixed(1)}%  item lost (stole, never scared) ${(100 * rows.filter((r) => r.lostItem).length / rows.length).toFixed(1)}%  window med ${med(rows.map((r) => r.windowMs)).toFixed(0)} ms  min window ${Math.min(...rows.map((r) => r.windowMs)).toFixed(0)} ms  time to catch med ${med(caught.map((r) => r.caughtMs)).toFixed(0)} ms  min window of an unscared rat ${Math.min(...rows.filter((r) => !r.caught).map((r) => r.windowMs)).toFixed(0)} ms  earliest steal ${Math.min(...stolen.map((r) => r.stealMs)).toFixed(0)} ms`);
