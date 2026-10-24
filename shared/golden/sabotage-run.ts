// Test support: a whole versus round where every chef runs a sabotage role (golden/sabotage-bot.ts), through the public controls of the sim.
import type { Difficulty } from '../difficulty';
import { SIGMAS } from '../symmetry';
import { RecBus } from './bot';
import { newSabMem, sabotageControls, type Role } from './sabotage-bot';
import { COUNTDOWN_MS, TICK_MS, addPlayer, createGame, tick, type Controls, type Game } from '../overcooked';
import type { SabotageMode } from '../sabotage-config';
import { versusMap } from '../versusMaps';
export type { Role } from './sabotage-bot';

export interface Run { map: string; mode: SabotageMode; difficulty: Difficulty; seed: number; roles: Role[]; bags?: number; seconds?: number; teams?: number[][] }
export function runSabotage(r: Run, before?: (g: Game, t: number) => void) {
  const m = versusMap(r.map)!;
  const bus = new RecBus();
  const teams = r.teams ?? [[1, 2], [3, 4]];
  const g = createGame({ mapId: m.id, rows: m.rows, spawns: [...m.versus.spawns[0], ...m.versus.spawns[1]], difficulty: r.difficulty, seed: r.seed, countdownMs: COUNTDOWN_MS, bus, teams: teams.map((playerIds) => ({ playerIds })), sabotage: r.mode, sigma: m.versus.sigma, handicap: false });
  teams.forEach((ids) => ids.forEach((id, rank) => addPlayer(g, id, rank, rank)));
  g.sab?.teams.forEach((t) => { t.bags = r.bags ?? 0; });
  const mem = new Map(teams.flat().map((id) => [id, newSabMem()]));
  const rank = new Map(teams.flatMap((ids) => ids.map((id, k) => [id, k] as const)));
  if (r.seconds) g.params.roundMs = r.seconds * 1000;
  let t = 0;
  const limit = Math.ceil((COUNTDOWN_MS + g.params.roundMs) / TICK_MS) + 60;
  while (!g.over && t < limit) {
    bus.tick = t;
    before?.(g, t);
    const controls = new Map<number, Controls>();
    for (const p of g.players.values()) controls.set(p.id, sabotageControls(g, p, r.roles[rank.get(p.id)!] ?? 'idle', mem.get(p.id)!, t, rank.get(p.id)!, m.versus.sigma));
    tick(g, controls);
    t++;
  }
  return { g, bus, ticks: t, sigma: SIGMAS[m.versus.sigma] };
}

