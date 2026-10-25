// Interaction hit rate of a human-like bot (shared/feel/human-bot.ts) on ANY checkout of the sim.
//   npx tsx tools/feel-measure.ts [root] [--difficulty normal] [--reps 6] [--chefs 1] [--human '{"latMs":[0,0]}'] [--cfg '{"facingBonus":0.2}'] [--opts '{"magnet":true}'] [--json file] [--maps 15]
// `root` is a checkout holding shared/overcooked.ts and shared/maps.ts (default: this repo). The bot is always this repo's.
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ACTIONS, HUMAN, runGame, stationsFor, type Action, type Attempt, type Sim } from '../shared/feel/human-bot';

const args = process.argv.slice(2);
const flag = (n: string) => { const i = args.indexOf(`--${n}`); return i < 0 ? undefined : args[i + 1]; };
const root = resolve(args[0] && !args[0].startsWith('--') ? args[0] : new URL('..', import.meta.url).pathname);
const reps = Number(flag('reps') ?? 6), chefs = args.includes('--duo') ? 2 : Number(flag('chefs') ?? 1), nMaps = Number(flag('maps') ?? 15), cap = Number(flag('cap') ?? 4);
const gameOpts = { difficulty: flag('difficulty') ?? 'normal', ...JSON.parse(flag('opts') ?? '{}') };

Object.assign(HUMAN, JSON.parse(flag('human') ?? '{}')); // ablations of the bot: --human '{"aimErrDeg":0}'
const imp = async (f: string) => import(pathToFileURL(`${root}/shared/${f}.ts`).href);
const [oc, mp] = await Promise.all([imp('overcooked'), imp('maps')]);
if (flag('cfg')) { const mg = await imp('feel/magnet'); for (const lv of Object.values(mg.MAGNET_TUNING)) Object.assign(lv as object, JSON.parse(flag('cfg')!)); } // tuning scans: --cfg '{"facingBonus":0.2}' overrides the magnet table in this process
const sim: Sim = { createGame: oc.createGame, addPlayer: oc.addPlayer, tick: oc.tick, targetStation: oc.targetStation, isFloor: mp.isFloor, maps: mp.FIXED_MAPS.slice(0, nMaps) };

export async function sweep(): Promise<Attempt[]> {
  const rows: Attempt[] = [];
  let seed = 1;
  for (let mi = 0; mi < sim.maps.length; mi++) {
    const probe = sim.createGame({ mapId: sim.maps[mi]!.id, rows: sim.maps[mi]!.rows, spawns: sim.maps[mi]!.spawns, ...gameOpts });
    for (const action of ACTIONS) {
      const all = stationsFor(probe, action), list = all.length <= cap ? all : Array.from({ length: cap }, (_v, i) => all[Math.floor((i * all.length) / cap)]!); // a map with 12 counters must not outweigh the one oven
      for (const station of list) for (let k = 0; k < reps; k++) {
        const specs: { action: Action; station: number }[] = [{ action, station }];
        for (let c = 1; c < chefs; c++) { // companions doing something else at the same time: collisions and crowding
          const other = ACTIONS.filter((a) => a !== action && a !== 'deliver' && action !== 'deliver' && stationsFor(probe, a).length);
          const a2 = other[(seed + k + c) % other.length];
          if (!a2) continue;
          const l2 = stationsFor(probe, a2).filter((s) => !specs.some((x) => x.station === s));
          if (l2.length) specs.push({ action: a2, station: l2[(seed + k + c) % l2.length]! });
        }
        const res = await runGame(sim, mi, specs, seed++, gameOpts);
        rows.push(res[0]!); // the companion only adds traffic; its own result is not scored
      }
    }
  }
  return rows;
}

const pct = (n: number, d: number) => (d ? ((100 * n) / d).toFixed(1) : '-').padStart(5);
const med = (a: number[]) => { const s = a.filter(Number.isFinite).sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)]! : NaN; };
const mean = (a: number[]) => { const v = a.filter(Number.isFinite); return v.length ? v.reduce((x, y) => x + y, 0) / v.length : NaN; };
const pct90 = (a: number[]) => { const s = a.sort((x, y) => x - y); return s.length ? s[Math.floor(s.length * 0.9)]! : NaN; };
const line = (name: string, r: Attempt[]) => `${name.padEnd(10)} n=${String(r.length).padStart(4)}  first ${pct(r.filter((x) => x.first).length, r.length)}%  hit ${pct(r.filter((x) => x.hit).length, r.length)}%  wrong ${pct(r.filter((x) => x.wrong).length, r.length)}%  dash/att ${(r.reduce((s, x) => s + x.dashes, 0) / Math.max(1, r.length)).toFixed(2)}  presses ${(r.reduce((s, x) => s + x.presses, 0) / Math.max(1, r.length)).toFixed(2)}  press->hit ms ${med(r.filter((x) => x.hit).map((x) => x.fromPressMs)).toFixed(0)}  total ms med ${med(r.filter((x) => x.hit).map((x) => x.ms)).toFixed(0)} p90 ${pct90(r.filter((x) => x.hit).map((x) => x.ms)).toFixed(0)}  gap ${mean(r.map((x) => x.gap)).toFixed(2)}  ang ${mean(r.map((x) => x.angle)).toFixed(0)}`;

const rows = await sweep();
console.log(`root ${root}  ${JSON.stringify(gameOpts)}  ${chefs} chef(s)  reps ${reps}`);
console.log(line('ALL', rows));
for (const a of ACTIONS) console.log(line(a, rows.filter((r) => r.action === a)));
const j = flag('json');
if (j) writeFileSync(j, JSON.stringify(rows));
