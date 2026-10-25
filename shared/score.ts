// Difficulty metric D = (L + 14 T + 6 C) * (1 + 0.25 max(0, N / boards - 1)).
import { DIRS, floorComponents, isFloor, posKey, type Grid, type Pos } from './maps';
import { RECIPE_LEGS, accessTiles, analyze, stationsOf } from './validate';

export interface Metric {
  L: number;
  T: number;
  C: number;
  boards: number;
  D: number;
}

const chokepoints = (g: Grid, count: number): Set<string> => {
  const out = new Set<string>();
  g.forEach((row, y) =>
    row.forEach((_t, x) => {
      if (isFloor(g, x, y) && floorComponents(g, posKey(x, y)).count > count) out.add(posKey(x, y));
    }),
  );
  return out;
};

export function metric(g: Grid, n: number): Metric {
  const a = analyze(g);
  const passKeys = new Set(a.passes.map((p) => posKey(...p.pos)));
  const choke = chokepoints(g, a.count);
  const walk = (x: number, y: number) => isFloor(g, x, y) || passKeys.has(posKey(x, y));
  const starts = (key: Parameters<typeof stationsOf>[1]) => stationsOf(g, key).flatMap(([x, y]) => accessTiles(g, x, y));

  let L = 0,
    T = 0,
    C = 0;
  for (const [from, to] of RECIPE_LEGS) {
    const goal = new Set(starts(to).map(([x, y]) => posKey(x, y)));
    const parent = new Map<string, string | null>();
    const queue: Pos[] = [];
    for (const [x, y] of starts(from))
      if (!parent.has(posKey(x, y))) {
        parent.set(posKey(x, y), null);
        queue.push([x, y]);
      }
    let end: string | null = null;
    for (let i = 0; i < queue.length && !end; i++) {
      const [x, y] = queue[i]!;
      if (goal.has(posKey(x, y))) {
        end = posKey(x, y);
        break;
      }
      for (const [dx, dy] of DIRS) {
        const nx = x + dx,
          ny = y + dy,
          k = posKey(nx, ny);
        if (walk(nx, ny) && !parent.has(k)) {
          parent.set(k, posKey(x, y));
          queue.push([nx, ny]);
        }
      }
    }
    if (!end) return { L: Infinity, T: Infinity, C: Infinity, boards: stationsOf(g, 'K').length, D: Infinity };
    const path: string[] = [];
    for (let k: string | null = end; k; k = parent.get(k) ?? null) path.push(k);
    L += path.length - 1;
    T += path.filter((k) => passKeys.has(k)).length;
    if (path.slice(1, -1).some((k) => choke.has(k))) C++;
  }
  const boards = stationsOf(g, 'K').length;
  const D = (L + 14 * T + 6 * C) * (1 + 0.25 * Math.max(0, n / Math.max(1, boards) - 1));
  return { L, T, C, boards, D };
}
