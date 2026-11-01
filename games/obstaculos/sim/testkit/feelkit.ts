// Bots and levels that measure the FEEL of the campaign numbers (wind, soft-enemy shove, anchor slide) on the real sim: used by tools/s1-feel.ts (prints the tables) and by feel.test.ts
// (locks the conclusions). Not part of the game.
import { DT, PLAYER_H, PLAYER_W, TILE } from '../../constants';
import { ObstBot, type BotOut } from '../../bot';
import type { LevelDef } from '../../types';
import type { PlayerStep } from '../world/input';
import { createWorld, snapshot, step, type World } from '../world';

const room = (w: number, h: number, floor = 2): string[] =>
  Array.from({ length: h }, (_, y) => (y >= h - floor ? '#'.repeat(w) : `#${'.'.repeat(w - 2)}#`));
const cell = (rows: string[], x: number, y: number, s: string): void => {
  rows[y] = rows[y]!.slice(0, x) + s + rows[y]!.slice(x + s.length);
};
const base = (id: string, rows: string[], extra: Partial<LevelDef> = {}): LevelDef => ({
  id,
  name: id,
  biome: 'glacier',
  players: { min: 2, max: 2 },
  tether: 'freeOnly',
  stars: 1,
  parSec: 60,
  rows,
  ...extra,
});
const NOOP: PlayerStep = { move: 0, down: false, up: false, jump: false, grab: false };
export const stepOf = (o: BotOut): PlayerStep => ({ move: o.x, down: o.y > 0.6, up: o.y < -0.6, jump: o.jump, grab: o.grab });

export const windLevel = (gap: number, dir: -1 | 1): LevelDef => {
  const rows = room(40, 16);
  for (let y = 14; y < 16; y++) cell(rows, 18, y, '.'.repeat(gap));
  cell(rows, 18, 15, '~'.repeat(gap));
  cell(rows, 2, 13, 'S');
  cell(rows, 36, 13, 'G');
  return base('wind', rows, { wind: { dir, periodSec: 3, gustSec: 1 } });
};
export const enemyLevel = (): LevelDef => {
  const rows = room(40, 16);
  cell(rows, 2, 13, 'S');
  cell(rows, 36, 13, 'G');
  return base('enemies', rows, {
    enemies: [
      { x: 16, y: 13, range: 3 },
      { x: 26, y: 13, range: 3 },
    ],
  });
};
export const plateauLevel = (): LevelDef =>
  base(
    'anchor',
    Array.from({ length: 16 }, (_, y) => {
      const cs = ('#' + '.'.repeat(28) + '#').split('');
      if (y >= 8) for (let x = 1; x <= 14; x++) cs[x] = '#';
      if (y === 15) cs.fill('#');
      if (y === 7) cs[2] = 'S';
      if (y === 14) cs[27] = 'G';
      return cs.join('');
    }),
    { tether: 'chainOnly' },
  );

export interface BotRun {
  cleared: boolean;
  sec: number;
  deaths: number;
  heartsLost: number;
  shoves: number;
  stuns: number;
}
// Two ObstBots play `def` in a campaign world until cleared or `maxSec`. `delay` ticks of standing still first: it moves the gust / the beetles to another phase of their cycle.
export function playBots(def: LevelDef, world: 'glacier' | 'forest', delay: number, maxSec: number, patch?: (w: World) => void): BotRun {
  const w = createWorld({ level: def, mode: 'free', slots: [0, 1], campaign: { world } });
  patch?.(w);
  const bots = [new ObstBot(0), new ObstBot(1)];
  let shoves = 0,
    stuns = 0,
    deaths = 0;
  for (let t = 0; t < maxSec * 60 && w.status === 'playing'; t++) {
    const snap = snapshot(w);
    const inputs = bots.map((b) =>
      t < delay ? NOOP : stepOf(b.decide({ tick: snap.tick, grid: snap.grid, players: snap.players, goal: snap.goal })),
    );
    for (const e of step(w, inputs)) {
      if (e.name === 'obst.enemy') {
        if (e.data.action === 'push') shoves++;
        else stuns++;
      } else if (e.name === 'obst.death') deaths++;
    }
  }
  return { cleared: w.status === 'cleared', sec: w.tick * DT - delay / 60, deaths, heartsLost: w.heartsLost, shoves, stuns };
}

// The anchor that is not planted slides towards the edge while its partner dangles from the rope. slot 0 stands `dist` tiles from the cliff edge; slot 1 hangs. `react` >= 0: slot 0
// plants (B) that many seconds after the rope first goes taut (never when < 0). `window`: seconds from the rope going taut until slot 0 is over the edge (Infinity = it never gets there).
export function anchorTrial(slide: number, dist: number, react: number, offset = 0): { window: number; stopped: boolean } {
  const w = createWorld({ level: plateauLevel(), mode: 'chain', slots: [0, 1], campaign: { world: 'forest' } });
  w.camp!.slideTilesPerSec = slide;
  const p0 = w.players[0]!.body,
    p1 = w.players[1]!.body;
  p0.x = (15 - dist) * TILE - PLAYER_W / 2;
  p0.y = 8 * TILE - PLAYER_H;
  p1.x = 16 * TILE;
  p1.y = 5 * TILE;
  p1.vx = 0;
  p1.vy = 0;
  let tautAt = -1,
    planted = false,
    over = -1;
  for (let t = 0; t < 40 * 60; t++) {
    const inputs: PlayerStep[] = [{ ...NOOP }, { ...NOOP }];
    if (t >= offset && tautAt < 0 && w.ropes[0]!.links[0]!.taut) tautAt = t;
    if (react >= 0 && tautAt >= 0 && !planted && t - tautAt >= react * 60) {
      inputs[0]!.grab = true;
      planted = true;
    }
    step(w, inputs);
    if (over < 0 && p0.x + PLAYER_W / 2 > 15 * TILE + 4) {
      over = t;
      break;
    }
  }
  return { window: over < 0 ? Infinity : (over - Math.max(0, tautAt)) / 60, stopped: over < 0 && planted };
}
