import { TICK_MS, addPlayer, createGame, tick, type Controls, type Game, type Station } from './overcooked';
import { DIRS, isFloor } from './maps';
import { params, type Difficulty } from '@pichi/core/difficulty';

export const idle: Controls = { x: 0, y: 0, a: 0, b: false };
export const station = (g: Game, kind: string, n = 0) => g.stations.filter((s) => s.kind === kind)[n]!;
export const crate = (g: Game, type: number) => g.stations.find((s) => s.kind === 'crate' && s.crate === type)!;

export const P = params('normal', 2);
export function setup(difficulty: Difficulty = 'normal') {
  const g = createGame({ difficulty });
  addPlayer(g, 1, 0);
  addPlayer(g, 2, 1);
  return g;
}
// Puts a player on the floor tile next to a station, facing it.
export function face(g: Game, id: number, s: Station) {
  const p = g.players.get(id)!;
  const [dx, dy] = DIRS.find(([dx, dy]) => isFloor(g.grid, s.tx + dx, s.ty + dy))!;
  p.x = s.tx + dx + 0.5;
  p.y = s.ty + dy + 0.5;
  p.fx = -dx;
  p.fy = -dy;
}
export const press = (g: Game, id: number, n = 1) => tick(g, new Map([[id, { ...idle, a: n }]]));
export const run = (g: Game, ms: number, controls: Map<number, Controls> = new Map()) => {
  for (let t = 0; t < ms; t += TICK_MS) tick(g, controls);
};
export const hold = (id: number) => new Map([[id, { ...idle, b: true }]]);

export function cutAndCook(g: Game) {
  const board = station(g, 'board');
  const pot = station(g, 'pot');
  for (const type of [0, 1]) {
    face(g, 1, crate(g, type));
    press(g, 1);
    face(g, 1, board);
    press(g, 1);
    run(g, P.cutMs + 100, hold(1));
    press(g, 1);
    face(g, 1, pot);
    press(g, 1);
  }
  return pot;
}
