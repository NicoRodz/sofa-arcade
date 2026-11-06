import { type GameEvents, Emitter } from '../round/events';
import { DIRS, isFloor } from '../maps';
import { TICK_MS, addPlayer, createGame, tick, type Controls, type Game, type Station } from '../overcooked';
import type { SabotageMode } from '../sabotage-config';
import { versusMap } from '../versus/maps';
import type { Difficulty } from '@pichi/core';

// Sabotage S2: the rules of the bags, the catapult, the reticle, the landing, the limits and the cleaning, on the real versus maps V1 and V3.
// Pure logic: chefs are put next to the stations by hand and the ticks are run directly.

export const idle: Controls = { x: 0, y: 0, a: 0, b: false };
export type Log = { [K in keyof GameEvents]?: { t: number; p: GameEvents[K] }[] };

export function mk(
  o: { map?: string; mode?: SabotageMode; difficulty?: Difficulty; teams?: number[][]; handicap?: boolean; seed?: number } = {},
) {
  const m = versusMap(o.map ?? 'V1')!;
  const bus = new Emitter<GameEvents>();
  const log: Log = {};
  const teams = o.teams ?? [
    [1, 2],
    [3, 4],
  ];
  const g = createGame({
    mapId: m.id,
    rows: m.rows,
    spawns: [...m.versus.spawns[0], ...m.versus.spawns[1]],
    difficulty: o.difficulty ?? 'normal',
    seed: o.seed ?? 5,
    bus,
    teams: teams.map((playerIds) => ({ playerIds })),
    handicap: o.handicap,
    sabotage: o.mode ?? 'soft',
    sigma: m.versus.sigma,
  });
  for (const k of [
    'sabotage:bagReady',
    'sabotage:aim',
    'sabotage:launch',
    'sabotage:land',
    'sabotage:caught',
    'sabotage:burst',
    'sabotage:blocked',
    'chef:slip',
    'chef:recover',
    'trash:picked',
    'trash:binned',
    'trash:decayed',
    'itemPicked',
    'interactInvalid',
  ] as const) {
    bus.on(k, ((p: never) => {
      log[k] ??= [];
      (log[k] as { t: number; p: unknown }[]).push({ t: g.time, p });
    }) as never);
  }
  teams.forEach((ids) => ids.forEach((id, rank) => addPlayer(g, id, rank, rank)));
  return { g, log, m };
}
export const run = (g: Game, ms: number, c?: (id: number) => Controls) => {
  for (let t = 0; t < ms - 1e-6; t += TICK_MS)
    tick(g, new Map([...g.players.keys()].map((id): [number, Controls] => [id, c ? c(id) : idle])));
};
export const only = (id: number, c: Controls) => new Map([[id, c]]);
export const A: Controls = { ...idle, a: 1 };
/** Puts the chef on a floor tile next to the station, facing it. */
export function face(g: Game, id: number, s: Station) {
  const p = g.players.get(id)!;
  const [dx, dy] = DIRS.find(([dx, dy]) => isFloor(g.grid, s.tx + dx, s.ty + dy))!;
  Object.assign(p, { x: s.tx + dx + 0.5, y: s.ty + dy + 0.5, fx: -dx, fy: -dy, vx: 0, vy: 0 });
  return p;
}
export const station = (g: Game, kind: string, team: number) => g.stations.find((s) => s.kind === kind && s.owner === team)!;
export const pressA = (g: Game, id: number) => tick(g, only(id, A));
export const pressB = (g: Game, id: number) => {
  tick(g, only(id, { ...idle, b: true }));
  tick(g, only(id, idle));
};
/** Chef `id` carries a bag to its catapult and loads it (A). */
export function load(g: Game, id: number) {
  const p = g.players.get(id)!;
  p.item = 'trashBag';
  face(g, id, station(g, 'catapult', p.team));
  pressA(g, id);
  return p;
}
export const flights = (g: Game, team: number) => g.sab!.teams[team]!.flights;
export const hashOf = (g: Game) =>
  JSON.stringify([
    [...g.players.values()].map((p) => [p.x, p.y, p.item, p.slip, p.immuneUntil, p.inTrash]),
    g.floor,
    g.sab,
    g.time,
    g.teams.map((t) => [t.score, t.orders.map((o) => o.recipe)]),
  ]);
