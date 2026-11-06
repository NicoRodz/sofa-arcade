// Shared by the A5/A6 scenarios for the two-bot tests: the controller and scenario types, the room and level builders and the bot helpers.

import { ObstBot, PLAYER_H, PLAYER_W, type BotOut, type BotView, type LevelDef, type WorldSnap } from '..';

export type Ctrl = (slot: number, snap: WorldSnap, frame: number) => BotOut;

export interface Scenario {
  id: string;
  level: LevelDef;
  mode: 'chain' | 'free';
  world: 'beach' | 'forest' | 'glacier' | 'mine' | 'volcano' | 'summit' | null;
  make: () => Ctrl;
  maxSec: number;
}

export const idle: BotOut = { x: 0, y: 0, jump: false, grab: false };

export const cell = (rows: string[], x: number, y: number, s: string): void => {
  rows[y] = rows[y]!.slice(0, x) + s + rows[y]!.slice(x + s.length);
};

// rows x cols of air with a closed frame (wall columns at both ends) and a floor of `floor` rows at the bottom
export function room(w: number, h: number, floor = 2): string[] {
  return Array.from({ length: h }, (_, y) => (y >= h - floor ? '#'.repeat(w) : `#${'.'.repeat(w - 2)}#`));
}

export const base = (id: string, rows: string[], extra: Partial<LevelDef> = {}): LevelDef => ({
  id,
  name: id,
  biome: 'glacier',
  players: { min: 2, max: 2 },
  tether: 'any',
  stars: 1,
  parSec: 60,
  rows,
  ...extra,
});

// ObstBot for both slots (walls, gaps, spikes, tower + hand): the dynamics that only need walking and jumping
export const withBots = (): Ctrl => {
  const bots = [new ObstBot(0), new ObstBot(1)];
  return (slot, snap) => bots[slot]!.decide({ tick: snap.tick, grid: snap.grid, players: snap.players, goal: snap.goal } satisfies BotView);
};

export const me = (snap: WorldSnap, slot: number) => snap.players.find((p) => p.slot === slot)!;

export const cx = (p: { x: number }) => p.x + PLAYER_W / 2;

export const feet = (p: { y: number }) => p.y + PLAYER_H;

// walk to the middle of the goal zone and stop there (the level is cleared when everybody is inside at once)
export const toGoal = (snap: WorldSnap, p: { x: number }): BotOut => {
  const g = snap.goal;
  const d = g ? g.x + g.w / 2 - cx(p) : 1;
  return Math.abs(d) < 10 ? idle : { ...idle, x: d > 0 ? 1 : -1 };
};
