// Static validator of 'gate' (design section 2, "Placa Z + compuerta D"). Implemented by T1b. Returns the problems of a map (rows) for a team of n chefs, [] when it is fine.
// The protected region is what the doors hide (no S in it). With the doors closed the rest of the kitchen must stand on its own; every Z must be reachable there; with 2 chefs the porter
// must not sit idle (a Z beside a K, R or M); a map with no Z runs the door on the timer and must be playable with it shut.
import type { MechValidator } from '../../mech/types';

const SOLID = new Set(['#', '~']);
const STATIONS = new Set('12345KOPECXULRHMWQY'.split(''));
const DIRS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

function flood(rows: readonly string[], from: [number, number][], through: (c: string) => boolean): Set<number> {
  const seen = new Set<number>(from.map(([x, y]) => y * 16 + x));
  const q = [...from];
  for (let i = 0; i < q.length; i++) {
    const [x, y] = q[i]!;
    for (const [dx, dy] of DIRS) {
      const nx = x + dx,
        ny = y + dy,
        c = rows[ny]?.[nx];
      if (c === undefined || seen.has(ny * 16 + nx) || !through(c)) continue;
      seen.add(ny * 16 + nx);
      q.push([nx, ny]);
    }
  }
  return seen;
}
const find = (rows: readonly string[], ch: string) => rows.flatMap((r, y) => [...r].flatMap((c, x) => (c === ch ? [[x, y] as [number, number]] : [])));

export const gateValidate: MechValidator = (rows, n) => {
  const Z = find(rows, 'Z'),
    D = find(rows, 'D');
  if (!rows.length || (!Z.length && !D.length)) return [];
  const out: string[] = [];
  if (Z.length && !D.length) return ['gate: a plate Z without a door D does nothing'];
  const walk = (c: string) => !SOLID.has(c) && !STATIONS.has(c) && c !== 'D'; // doors closed: a wall
  const base = flood(rows, find(rows, 'S'), walk);
  const touches = (reach: Set<number>, ch: string) => find(rows, ch).some(([x, y]) => DIRS.some(([dx, dy]) => reach.has((y + dy) * 16 + x + dx)));
  const hidden = flood(rows, D, (c) => walk(c) || c === 'D');
  for (const k of base) hidden.delete(k);
  for (const [x, y] of Z) if (!base.has(y * 16 + x)) out.push(`gate: plate Z at (${x}, ${y}) cannot be reached with the doors closed`);
  if (!D.some(([x, y]) => DIRS.some(([dx, dy]) => hidden.has((y + dy) * 16 + x + dx)))) out.push('gate: the doors D lead to no protected region');
  if (!Z.length) for (const ch of ['E', 'O', 'K', '1']) if (!touches(base, ch)) out.push(`gate: with the doors shut nobody reaches a ${ch} (timer mode must be playable closed)`);
  if (Z.length && n < 2 && ['E', 'O', 'K', '1', 'P'].some((ch) => touches(hidden, ch) && !touches(base, ch))) out.push('gate: a lone chef cannot hold the plate and work behind the door');
  if (Z.length && n === 2 && !Z.some(([x, y]) => DIRS.some(([dx, dy]) => 'KRM'.includes(rows[y + dy]?.[x + dx] ?? ' ')))) out.push('gate: with 2 chefs the porter has no job: put a Z beside a K, R or M');
  return out;
};
