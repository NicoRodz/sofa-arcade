// Static validator of 'woodOven', implemented by T1e: a W needs a Q whose walk to it is at least 5 tiles (so the bellows are blown and then the chef runs), both must be reachable, and the map keeps a normal
// oven (O) so a pizza never depends on the fire alone. The Q feeds the nearest W by Manhattan distance, ties to the first in reading order (the sim does the same).
import type { MechValidator } from '../../mech/types';
import { STEPS, distances, find, walkable, type Cell } from './kneader';

export const MIN_WALK = 5;
const manhattan = (a: Cell, b: Cell) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);

export const woodOvenValidate: MechValidator = (rows) => {
  const ws = find(rows, 'W'),
    qs = find(rows, 'Q');
  if (!ws.length && !qs.length) return [];
  const problems: string[] = [];
  if (!ws.length) problems.push('woodOven: Q has no W to feed');
  if (!qs.length) problems.push('woodOven: W has no bellows (Q)');
  if (!find(rows, 'O').length) problems.push('woodOven: the map needs at least one normal oven (O)');
  const spawn = find(rows, 'S')[0];
  const reach = spawn ? distances(rows, spawn) : new Map<string, number>();
  const touches = (c: Cell) => STEPS.some(([dx, dy]) => reach.has(`${c[0] + dx!},${c[1] + dy!}`));
  for (const q of qs) {
    const w = [...ws].sort((a, b) => manhattan(a, q) - manhattan(b, q))[0];
    if (!w) continue;
    if (!touches(q)) problems.push(`woodOven: nobody reaches the bellows at (${q[0]}, ${q[1]})`);
    if (!touches(w)) problems.push(`woodOven: nobody reaches the oven W at (${w[0]}, ${w[1]})`);
    // the stations are not walkable: the walk is the distance between the tiles next to Q and the tiles next to W, plus the two steps onto the stations
    let best = Infinity;
    for (const [fx, fy] of STEPS.map(([dx, dy]): Cell => [q[0] + dx!, q[1] + dy!]).filter(([x, y]) => walkable(rows, x, y))) {
      const d = distances(rows, [fx, fy]);
      for (const [dx, dy] of STEPS) best = Math.min(best, (d.get(`${w[0] + dx!},${w[1] + dy!}`) ?? Infinity) + 2);
    }
    if (best < MIN_WALK)
      problems.push(`woodOven: the walk from Q (${q[0]}, ${q[1]}) to W (${w[0]}, ${w[1]}) is ${best} tiles, it needs at least ${MIN_WALK}`);
  }
  return problems;
};
