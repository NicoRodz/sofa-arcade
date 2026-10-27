// Test support of the kneader and woodOven rules: a round on the test map with chefs put on a tile, facing a station.
import { addPlayer, createGame, tick, type Controls, type Game, type Item } from '../../../sim/overcooked';
import type { MechId } from '../../../sim/mech/ids';

export const press = (b: boolean, a = 0, x = 0, y = 0): Controls => ({ x, y, a, b });
export function rig(rows: readonly string[], mech: MechId, n = 2): Game {
  const g = createGame({ rows, mech: { [mech]: true }, n, seed: 1 });
  for (let i = 1; i <= n; i++) addPlayer(g, i, i - 1, i - 1);
  return g;
}
/** Chef `id` stands in the middle of tile (tx, ty) facing (fx, fy), hands as `item`. */
export function put(g: Game, id: number, tx: number, ty: number, fx: number, fy: number, item: Item | null = null) {
  const p = g.players.get(id)!;
  Object.assign(p, { x: tx + 0.5, y: ty + 0.5, vx: 0, vy: 0, fx, fy, item });
}
export const run = (g: Game, ticks: number, controls: Map<number, Controls>) => {
  for (let t = 0; t < ticks; t++) tick(g, controls);
};
export const station = (g: Game, kind: string) => g.stations.find((s) => s.kind === kind)!;
