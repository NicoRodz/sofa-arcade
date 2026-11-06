// The human bot's types, its one table of imperfections (HUMAN) and the small maths it uses (moved out of human-bot.ts).
import type { Rng } from '@pichi/core';

export interface Ctl {
  x: number;
  y: number;
  a: number;
  b: boolean;
}
/* eslint-disable @typescript-eslint/no-explicit-any */
export interface Sim {
  createGame(o: any): any;
  addPlayer(g: any, id: number, slot: number, spawn?: number): any;
  tick(g: any, c: Map<number, Ctl>): void | Promise<void>; // a promise when the controls travel over a real relay (apps/server/test/magnet.ws.slow.test.ts)
  isFloor(grid: any, x: number, y: number): boolean;
  targetStation?(g: any, p: any): any; // optional: lets a record say which station the sim would have chosen when the first press landed
  maps: readonly { id: string; rows: readonly string[]; spawns?: readonly [number, number][] }[];
}
export type Action = 'take' | 'chop' | 'place' | 'oven' | 'deliver' | 'drop' | 'pickup';
export const ACTIONS: readonly Action[] = ['take', 'chop', 'place', 'oven', 'deliver', 'drop', 'pickup'];
const KIND: Record<Action, string> = {
  take: 'crate',
  chop: 'board',
  place: 'pot',
  oven: 'pot',
  deliver: 'window',
  drop: 'counter',
  pickup: 'counter',
};
export const stationsFor = (g: any, a: Action) =>
  g.stations
    .map((s: any, i: number) => ({ s, i }))
    .filter(({ s }: any) => s.kind === KIND[a])
    .map(({ i }: any) => i as number);

export const HUMAN = {
  noiseDeg: 14,
  noiseTauS: 0.3,
  magMin: 0.7,
  magMax: 1,
  aimOffset: 0.12, // stick noise; where inside the tile it aims
  stopMin: 0.05,
  stopMax: 0.5,
  anticipate: [0.5, 1] as const, // tiles: stop radius; share of the latency drift it compensates
  aimErrDeg: 40,
  aimHoldMs: [100, 260] as const,
  pressAfterMs: [60, 180] as const,
  holdPushProb: 0.5,
  latMs: [60, 150] as const,
  retryMs: 350,
  maxPresses: 3,
  giveUpMs: 12_000,
};
export const between = (r: Rng, [a, b]: readonly [number, number]) => a + (b - a) * r();
export const gauss = (r: Rng) => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());
export const rot = (x: number, y: number, deg: number): [number, number] => {
  const t = (deg * Math.PI) / 180,
    c = Math.cos(t),
    s = Math.sin(t);
  return [x * c - y * s, x * s + y * c];
};

export interface Attempt {
  seed: number;
  mapIdx: number;
  map: string;
  action: Action;
  station: number;
  hit: boolean;
  first: boolean;
  wrong: boolean;
  ms: number;
  presses: number;
  dashes: number;
  fromPressMs: number;
  dist0: number;
  gap: number;
  angle: number;
  pick: number;
  px: number;
  py: number;
  fx: number;
  fy: number;
} // gap: tiles from the chef's centre to the station's edge when the first press lands; angle: degrees between the facing and the station's centre
export interface Spec {
  action: Action;
  station: number;
  start?: [number, number];
}
