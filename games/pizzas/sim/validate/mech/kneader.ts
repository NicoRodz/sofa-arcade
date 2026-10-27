// Static validator of 'kneader' (M), implemented by T1e: every M has a pair of opposite floor tiles for its handles, the dough crate exists, and with n >= 2 two different chefs reach the two handles
// (the n first spawns, in reading order). With a single chef the kneader would still work at x0.35, but a team of one is not what the mechanic is for.
import type { MechValidator } from '../../mech/types';

export type Cell = [number, number];
const WALKABLE = new Set(['.', 'S', 'Z', 'D', 'a', 'g', '*', 'b', '=', '>', '<', '^', 'v']);
export const at = (rows: readonly string[], x: number, y: number) => rows[y]?.[x] ?? '#';
export const find = (rows: readonly string[], c: string): Cell[] =>
  rows.flatMap((r, y) => [...r].flatMap((ch, x): Cell[] => (ch === c ? [[x, y]] : [])));
export const STEPS: Cell[] = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
];
export const walkable = (rows: readonly string[], x: number, y: number) => WALKABLE.has(at(rows, x, y));

/** Walking distance (in tiles) over the walkable floor from a tile to every tile it reaches; the start itself is 0. */
export function distances(rows: readonly string[], from: Cell): Map<string, number> {
  const d = new Map<string, number>([[`${from[0]},${from[1]}`, 0]]);
  const q: Cell[] = [from];
  for (let i = 0; i < q.length; i++) {
    const [x, y] = q[i]!;
    for (const [dx, dy] of STEPS) {
      const k = `${x + dx},${y + dy}`;
      if (!d.has(k) && WALKABLE.has(at(rows, x + dx, y + dy))) {
        d.set(k, d.get(`${x},${y}`)! + 1);
        q.push([x + dx, y + dy]);
      }
    }
  }
  return d;
}

export const kneaderValidate: MechValidator = (rows, n) => {
  const ms = find(rows, 'M');
  if (!ms.length) return [];
  const problems: string[] = [];
  if (n < 2) problems.push('kneader: M needs at least 2 chefs');
  if (!find(rows, '1').length) problems.push('kneader: M has no dough crate (1)');
  const spawns = find(rows, 'S').slice(0, Math.max(n, 1));
  const reach = spawns.map((s) => distances(rows, s));
  for (const [mx, my] of ms) {
    const pair = [
      [
        [mx - 1, my],
        [mx + 1, my],
      ],
      [
        [mx, my - 1],
        [mx, my + 1],
      ],
    ].find(([a, b]) => walkable(rows, a![0]!, a![1]!) && walkable(rows, b![0]!, b![1]!));
    if (!pair) {
      problems.push(`kneader: M at (${mx}, ${my}) has no pair of opposite floor tiles for its handles`);
      continue;
    }
    const who = pair.map((h) => reach.flatMap((r, i) => (r.has(`${h![0]},${h![1]}`) ? [i] : [])));
    if (!who[0]!.length || !who[1]!.length) problems.push(`kneader: no chef reaches both handles of M at (${mx}, ${my})`);
    else if (n >= 2 && !who[0]!.some((a) => who[1]!.some((b) => a !== b)))
      problems.push(`kneader: two different chefs cannot reach both handles of M at (${mx}, ${my})`);
  }
  return problems;
};
