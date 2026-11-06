import { type GameEvents, Emitter } from '../round/events';
import { DIRS, isFloor } from '../maps';
import { TICK_MS, addPlayer, createGame, tick, type Controls, type Game, type Recipe } from '../overcooked';
import { MIRRORS, twinSpawns } from '../../test/golden/mirror-bot';

export const idle: Controls = { x: 0, y: 0, a: 0, b: false };
export const V1 = MIRRORS.v1;
export type Log = { [K in keyof GameEvents]?: { t: number; p: GameEvents[K] }[] };

/** A versus game on V1 with the chefs of every team added. `log` collects each event with the match time it happened at. */
export function mk(
  teams: number[][],
  o: { difficulty?: 'easy' | 'normal' | 'hard'; seed?: number; handicap?: boolean; rows?: readonly string[] } = {},
) {
  const bus = new Emitter<GameEvents>();
  const log: Log = {};
  const rows = o.rows ?? V1.rows;
  const g = createGame({
    rows,
    spawns: twinSpawns(rows, V1.sigma, V1.half),
    difficulty: o.difficulty ?? 'normal',
    seed: o.seed ?? 5,
    bus,
    teams: teams.map((playerIds) => ({ playerIds })),
    handicap: o.handicap,
  });
  for (const k of [
    'orderNew',
    'delivered',
    'vipNew',
    'vipWon',
    'vipLost',
    'teamK',
    'playerDropped',
    'playerBack',
    'playerGone',
    'matchPaused',
    'matchResumed',
    'roundEnd',
    'streak',
    'orderExpired',
  ] as const) {
    bus.on(k, ((p: never) => {
      log[k] = [...(log[k] ?? []), { t: g.time, p }] as never;
    }) as never);
  }
  teams.forEach((ids) => ids.forEach((id, rank) => addPlayer(g, id, rank, rank)));
  return { g, log };
}
export const run = (g: Game, ms: number) => {
  for (let t = 0; t < ms - 1e-6; t += TICK_MS) tick(g, new Map());
};
export const runUntil = (g: Game, f: () => boolean, maxMs = 200_000) => {
  for (let t = 0; t < maxMs && !f(); t += TICK_MS) tick(g, new Map());
};
export const orderOf = (g: Game, team: number, recipe: Recipe, leftMs = 0, vip = false) => ({
  id: g.teams[team]!.orderSeq++,
  expiresAt: g.time + leftMs,
  warned: true,
  recipe,
  ...(vip ? { vip: true } : {}),
});

/** Puts the chef at its own window with a dish in hand (no tick yet). */
export function standAtWindow(g: Game, id: number, item: 'dish' | 'dishQ' = 'dishQ') {
  const p = g.players.get(id)!;
  const w = g.stations.find((s) => s.kind === 'window' && s.owner === p.team)!;
  const [dx, dy] = DIRS.find(([dx, dy]) => isFloor(g.grid, w.tx + dx, w.ty + dy))!;
  p.x = w.tx + dx + 0.5;
  p.y = w.ty + dy + 0.5;
  p.fx = -dx;
  p.fy = -dy;
  p.vx = p.vy = 0;
  p.item = item;
}
/** One tick in which the given chefs (already standing at their windows) press A. */
export const pressA = (g: Game, ids: number[]) => tick(g, new Map(ids.map((id): [number, Controls] => [id, { ...idle, a: 1 }])));
export const serve = (g: Game, id: number, item: 'dish' | 'dishQ' = 'dishQ') => {
  standAtWindow(g, id, item);
  pressA(g, [id]);
};
