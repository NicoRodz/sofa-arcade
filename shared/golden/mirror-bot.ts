// Versus test support (nothing in the game imports this): two kitchens that are each other's isometry, and scripted chefs for both.
// The team-1 chefs run the SAME script as the team-0 ones in the reflected world: their position, facing and stations go through
// sigma into team 0's frame, the script decides there, and the stick it returns goes back through sigma. So "mirrored scripts" are
// exact by construction and any difference in the round comes from the sim, not from the bots.
import { COUNTDOWN_MS, TICK_MS, addPlayer, createGame, tick, type Controls, type Game, type Player, type Station } from '../overcooked';
import { SIGMAS, type Sigma } from '../symmetry';
import type { Difficulty } from '../difficulty';
import { MAP_H, MAP_W } from '../maps';
import { RecBus, decide, type Mem } from './bot';

// The design's legend (pizzas-modalidades-coop-versus §2) onto the real one: M T Q = crates 1 2 3, '=' counter, H oven, C board, B trash,
// '|' barrier (a wall), a/b start tiles. P L E . # are the same.
const LEGEND: Record<string, string> = { M: '1', T: '2', Q: '3', '=': 'C', H: 'O', C: 'K', B: 'X', '|': '#', a: 'S', b: 'S' };
export const fromDesign = (rows: readonly string[]): string[] => rows.map((r) => [...r].map((c) => LEGEND[c] ?? c).join(''));

// V1 "Duelo clasico" and V3 "Dos pisos", as drawn in the design (a mirror and a 180-degree rotation).
export const V1_DESIGN = [
  '#MTQ#HH||HH#QTM#',
  '=......||......=',
  'C......||......C',
  'C..==..||..==..C',
  '=..==..||..==..=',
  'P.a..a.||.b..b.P',
  'L.a..a.||.b..b.L',
  'B......||......B',
  '#==E==#||#==E==#',
];
export const V3_DESIGN = [
  '#MTQ=HH=CC=PL=B#',
  '=..............E',
  '=..a...a...a...=',
  '#==============#',
  '||||||||||||||||',
  '#==============#',
  '=...b...b...b..=',
  'E..............=',
  '#B=LP=CC=HH=QTM#',
];
export const MIRROR_V1 = fromDesign(V1_DESIGN);
export const ROT_V3 = fromDesign(V3_DESIGN);

export const isoOf = (sigma: Sigma) => ({
  tile: (x: number, y: number): [number, number] => sigma(x, y, MAP_W, MAP_H),
  point: (x: number, y: number): [number, number] => { const [px, py] = sigma(x - 0.5, y - 0.5, MAP_W, MAP_H); return [px + 0.5, py + 0.5]; }, // a point is a tile index measured from the tile centre
  vec: (x: number, y: number): [number, number] => { const [ox, oy] = sigma(0, 0, MAP_W, MAP_H), [px, py] = sigma(1, 1, MAP_W, MAP_H); return [(px - ox) * x, (py - oy) * y]; },
});

// Starts of team 0 (the 'S' tiles of the top/left half in reading order) interleaved with their twins, so rank i of team 1 is sigma(rank i of team 0).
export function twinSpawns(rows: readonly string[], sigma: Sigma, half: (x: number, y: number) => boolean): [number, number][] {
  const out: [number, number][] = [];
  rows.forEach((r, y) => [...r].forEach((c, x) => { if (c === 'S' && half(x, y)) out.push([x, y], sigma(x, y, MAP_W, MAP_H)); }));
  return out;
}

export interface VersusRun {
  rows: readonly string[]; sigma: Sigma; half: (x: number, y: number) => boolean;
  difficulty: Difficulty; seed: number; teams: number[][]; handicap?: boolean;
  flags?: { burn?: boolean; fire?: boolean; events?: boolean }; // the new rules (off by default: the original proofs stay exact)
}
export const MIRRORS = {
  v1: { rows: MIRROR_V1, sigma: SIGMAS.mirrorX, half: (x: number) => x < MAP_W / 2 },
  v3: { rows: ROT_V3, sigma: SIGMAS.rot180, half: (_x: number, y: number) => y < MAP_H / 2 },
} as const;

const snap = (v: number) => Math.round(v * 1e9) / 1e9;

export interface VersusResult { g: Game; bus: RecBus; ticks: number }

/** Plays the whole round with scripted chefs in both kitchens. `before(g, tick)` runs before each tick (inject drops, reads state). */
export function runVersus(r: VersusRun, before?: (g: Game, t: number) => void): VersusResult {
  const iso = isoOf(r.sigma);
  const bus = new RecBus();
  const g = createGame({ mapId: 'versus-test', difficulty: r.difficulty, rows: r.rows, spawns: twinSpawns(r.rows, r.sigma, r.half), seed: r.seed, countdownMs: COUNTDOWN_MS, bus, teams: r.teams.map((playerIds) => ({ playerIds })), handicap: r.handicap, ...r.flags });
  r.teams.forEach((ids) => ids.forEach((id, rank) => addPlayer(g, id, rank, rank)));
  const mem = new Map(r.teams.flat().map((id) => [id, { step: 0, since: 0, lastPress: -99, bin: false } as Mem]));
  const rankOf = new Map(r.teams.flatMap((ids) => ids.map((id, rank) => [id, rank] as const)));
  let t = 0;
  const limit = Math.ceil((COUNTDOWN_MS + g.params.roundMs) / TICK_MS) + 60;
  while (!g.over && t < limit) {
    bus.tick = t;
    before?.(g, t);
    const controls = new Map<number, Controls>();
    for (const p of g.players.values()) {
      if (p.ghost) continue;
      const flip = p.team === 1; // team 1 lives in the reflected world
      const to = (x: number, y: number): [number, number] => (flip ? iso.point(x, y) : [x, y]);
      const stations: Station[] = g.stations.filter((s) => s.owner === p.team).map((s) => { const [tx, ty] = flip ? iso.tile(s.tx, s.ty) : [s.tx, s.ty]; return { ...s, tx, ty }; });
      if (flip) stations.sort((a, b) => a.ty - b.ty || a.tx - b.tx); // reading order in team 0's frame
      const [x, y] = to(p.x, p.y).map(snap) as [number, number]; // float noise (1e-15) must not decide which tile a chef is in when it stands on a tile edge
      const [fx, fy] = flip ? iso.vec(p.fx, p.fy) : [p.fx, p.fy];
      const view = { grid: g.grid, stations, time: g.time } as unknown as Game;
      const me = { ...p, x, y, fx, fy } as Player;
      const c = decide(view, me, rankOf.get(p.id)!, mem.get(p.id)!, t);
      const [cx, cy] = flip ? iso.vec(c.x, c.y) : [c.x, c.y];
      controls.set(p.id, { ...c, x: cx, y: cy });
    }
    tick(g, controls);
    t++;
  }
  return { g, bus, ticks: t };
}
