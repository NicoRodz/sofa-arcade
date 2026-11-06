import { DIRS, fixedMap, isFloor } from '../maps';
import { TICK_MS, addPlayer, createGame, tick } from '../overcooked';
import type { Controls, Game, Station } from '../overcooked';

export const idle: Controls = { x: 0, y: 0, a: 0, b: false };
export const MAP = fixedMap('10')!;

/** Two chefs side by side in the same kitchen: 1 plays on Ayudante, 2 is the control. */
export function duo(difficulty: 'easy' | 'normal' | 'hard' = 'normal', assist: number[] = [1]) {
  const g = createGame({ mapId: '10', rows: MAP.rows, spawns: MAP.spawns, n: 2, seed: 5, difficulty, assist });
  addPlayer(g, 1, 0);
  addPlayer(g, 2, 1);
  return g;
}
export const station = (g: Game, kind: string, n = 0) => g.stations.filter((s) => s.kind === kind)[n]!;
/** Puts chef `id` next to `s` (on the open tile), `gap` tiles further away than touching, facing `dir` ('to' = the station, 'away' = the opposite way). */
export function place(g: Game, id: number, s: Station, o: { gap?: number; dir?: 'to' | 'away' } = {}) {
  const p = g.players.get(id)!;
  const [dx, dy] = DIRS.find(([x, y]) => isFloor(g.grid, s.tx + x, s.ty + y) && isFloor(g.grid, s.tx + 2 * x, s.ty + 2 * y))!; // a free tile and one more behind it
  const gap = o.gap ?? 0;
  Object.assign(p, {
    x: s.tx + dx * (1 + gap) + 0.5,
    y: s.ty + dy * (1 + gap) + 0.5,
    fx: o.dir === 'away' ? dx : -dx,
    fy: o.dir === 'away' ? dy : -dy,
    vx: 0,
    vy: 0,
  });
  return [dx, dy] as const;
}
export const run = (g: Game, ms: number, c: Map<number, Controls> = new Map()) => {
  for (let t = 0; t < ms; t += TICK_MS) tick(g, c);
};

// Small purpose-built rooms (16 x 9): the situation is exactly what the test says, not whatever a fixed map happens to have around.
export const WALLS = ['################', '#..............#', '#..............#', '#..............#'];
export const room = (mid: string[], assist: number[], o: { hazards?: boolean; difficulty?: 'easy' | 'normal' | 'hard' } = {}) => {
  const rows = [...WALLS, ...mid, ...WALLS.slice(0, 3).reverse()].slice(0, 9);
  const g = createGame({
    rows,
    spawns: [
      [2, 2],
      [3, 2],
    ],
    n: 2,
    seed: 5,
    difficulty: o.difficulty ?? 'normal',
    assist,
    hazards: o.hazards,
  });
  addPlayer(g, 1, 0);
  addPlayer(g, 2, 1);
  return g;
};
export const CRATE_ROOM = ['#......1.......#', '#..............#']; // rows 4-5: one crate at (7, 4) in open floor
export const at = (g: Game, id: number, x: number, y: number, fx = -1, fy = 0) => {
  const p = g.players.get(id)!;
  Object.assign(p, { x, y, fx, fy, vx: 0, vy: 0 });
  return p;
};
