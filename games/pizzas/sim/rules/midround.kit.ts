import { expect } from 'vitest';
import { type GameEvents, Emitter } from '../round/events';
import { DIRS, fixedMap, isFloor } from '../maps';
import { TICK_MS, addPlayer, createGame, tick, type Controls, type Game, type Station } from '../overcooked';
import { ANNOUNCE_MS, type EventKind } from './midround';

export const idle: Controls = { x: 0, y: 0, a: 0, b: false };
export type Log = { [K in keyof GameEvents]?: { t: number; p: GameEvents[K] }[] };
export const KINDS = [
  'event:announce',
  'event:start',
  'event:end',
  'event:inspector',
  'rat:appear',
  'rat:steal',
  'rat:scared',
  'rat:gone',
  'orderNew',
  'delivered',
  'oven:burnt',
  'potReady',
] as const;

export function mk(
  o: {
    map?: string;
    difficulty?: 'easy' | 'normal' | 'hard';
    seed?: number;
    n?: number;
    events?: boolean;
    burn?: boolean;
    kind?: EventKind;
    startAt?: number;
  } = {},
) {
  const bus = new Emitter<GameEvents>();
  const log: Log = {};
  const g = createGame({
    rows: fixedMap(o.map ?? '1')!.rows,
    mapId: o.map ?? '1',
    n: 2,
    difficulty: o.difficulty ?? 'normal',
    seed: o.seed ?? 5,
    bus,
    events: o.events ?? true,
    burn: o.burn,
    hazardsV2: false,
  });
  for (const k of KINDS)
    bus.on(k, ((p: never) => {
      log[k] = [...((log[k] as { t: number; p: unknown }[] | undefined) ?? []), { t: g.time, p }] as never;
    }) as never);
  for (let i = 1; i <= (o.n ?? 1); i++) addPlayer(g, i, i - 1, i - 1);
  if (o.kind) force(g, o.kind, o.startAt ?? 5000);
  return { g, log };
}
/** Makes this round's event be `kind`, starting at match time `startAt`. */
export function force(g: Game, kind: EventKind, startAt: number) {
  Object.assign(g.mid!, { kind, startAt, announceAt: startAt - ANNOUNCE_MS, endAt: Infinity, phase: 'wait', dark: false, rat: null });
}
export const run = (g: Game, ms: number, c: (id: number) => Controls = () => idle) => {
  for (let t = 0; t < ms - 1e-6; t += TICK_MS) tick(g, new Map([...g.players.keys()].map((id): [number, Controls] => [id, c(id)])));
};
export const runTo = (g: Game, time: number, c?: (id: number) => Controls) => run(g, Math.max(0, time - g.time), c);
export const only = (id: number, c: Controls) => new Map([[id, c]]);
export const near = (a: number, b: number) => expect(Math.abs(a - b)).toBeLessThanOrEqual(TICK_MS + 1);
export function face(g: Game, id: number, s: Station) {
  const p = g.players.get(id)!;
  const [dx, dy] = DIRS.find(([dx, dy]) => isFloor(g.grid, s.tx + dx, s.ty + dy))!;
  Object.assign(p, { x: s.tx + dx + 0.5, y: s.ty + dy + 0.5, fx: -dx, fy: -dy, vx: 0, vy: 0 });
  return p;
}
export const times = (log: Log, k: keyof GameEvents) => (log[k] ?? []).map((e) => e.t);
