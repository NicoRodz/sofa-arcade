// Versus layout: which kitchen owns each tile and whether the two floors are twins under sigma.
import { floorComponents, isFloor, posKey, type Grid, type Pos } from '../maps';
import { SIGMAS } from '../maps/symmetry';
import { accessTiles } from './stations';

// --- Versus ---------------------------------------------------------------------------------------------------------------
// Design pizzas-modalidades-coop-versus §2 (validator): both kitchens are twins under sigma, the floors do not touch, every station
// is reachable by each team, the recipe can be finished in each kitchen, there are spawns for every team size, and the two kitchens
// cost the same to work in (route, first step, interaction tiles, area; <= 3% apart).

export const VERSUS_TOL = 0.03;

/** Chefs per team for a total range of players: the smallest team of the smallest split, the biggest team of the biggest. */
export const teamRange = (nMin: number, nMax: number) => ({ min: Math.max(1, Math.floor(nMin / 2)), max: Math.ceil(nMax / 2) });

export interface VersusLayout {
  errors: string[];
  comp: number[][]; // floor region per tile, -1 elsewhere
  owner: (0 | 1 | null)[][]; // kitchen (0 = A, 1 = B) of every floor tile and station; null for walls, water, shared and buried tiles
}

/**
 * Splits a versus grid into its two kitchens: floor regions joined by a counter belong together; sigma must send each kitchen onto
 * the other one. Stations belong to the kitchen whose floor they touch. A station touching both kitchens is an error unless it is
 * declared shared.
 */
export function versusLayout(g: Grid, sigmaName: keyof typeof SIGMAS, shared: readonly Pos[] = []): VersusLayout {
  const h = g.length,
    w = g[0]?.length ?? 0;
  const sigma = SIGMAS[sigmaName];
  const errors: string[] = [];
  const sh = new Set(shared.map(([x, y]) => posKey(x, y)));
  const { comp, count } = floorComponents(g);
  const owner: VersusLayout['owner'] = g.map((row) => row.map(() => null));
  const fail = (): VersusLayout => ({ errors, comp, owner });
  // image of every floor region
  const image = Array<number>(count).fill(-1);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (!isFloor(g, x, y)) continue;
      const [tx, ty] = sigma(x, y, w, h);
      if (!isFloor(g, tx, ty)) {
        errors.push(`floor (${x}, ${y}) has no floor twin at (${tx}, ${ty})`);
        return fail();
      }
      const c = comp[y]![x]!,
        ic = comp[ty]![tx]!;
      if (image[c]! < 0) image[c] = ic;
      else if (image[c] !== ic) {
        errors.push(`floor region ${c} is not sent onto one region by sigma`);
        return fail();
      }
    }
  const cross = image.findIndex((ic, c) => ic === c);
  if (cross >= 0) {
    errors.push(`floor region ${cross} is its own twin: it crosses the barrier`);
    return fail();
  }
  // kitchens: regions joined through counters (items cross there), except declared shared tiles
  const root = Array.from({ length: count }, (_v, i) => i);
  const find = (i: number): number => (root[i] === i ? i : (root[i] = find(root[i]!)));
  const joins: { pos: Pos; comps: number[] }[] = [];
  g.forEach((row, y) =>
    row.forEach((t, x) => {
      if (t.kind !== 'station' || t.station !== 'counter' || sh.has(posKey(x, y))) return;
      const comps = [...new Set(accessTiles(g, x, y).map(([ax, ay]) => comp[ay]![ax]!))];
      for (const c of comps.slice(1)) root[find(c)] = find(comps[0]!);
      if (comps.length > 1) joins.push({ pos: [x, y], comps });
    }),
  );
  const rootOf = (c: number) => find(c);
  const roots = [...new Set(Array.from({ length: count }, (_v, c) => rootOf(c)))];
  const linked = Array.from({ length: count }, (_v, c) => c).find((c) => rootOf(c) === rootOf(image[c]!));
  if (linked !== undefined) {
    const via = joins.find((j) => j.comps.some((c) => rootOf(c) === rootOf(linked)));
    errors.push(
      via
        ? `the kitchens are connected: counter at (${via.pos[0]}, ${via.pos[1]}) joins them`
        : `floor regions ${linked} and ${image[linked]} are connected`,
    );
    return fail();
  }
  if (roots.length !== 2) {
    errors.push(`found ${roots.length} kitchens, expected 2`);
    return fail();
  }
  const first = comp.flat().find((c) => c >= 0);
  const sideOf = (c: number): 0 | 1 => (rootOf(c) === rootOf(first ?? 0) ? 0 : 1);
  g.forEach((row, y) =>
    row.forEach((t, x) => {
      if (t.kind === 'floor') {
        owner[y]![x] = sideOf(comp[y]![x]!);
        return;
      }
      if (t.kind !== 'station') return;
      const sides = new Set(accessTiles(g, x, y).map(([ax, ay]) => sideOf(comp[ay]![ax]!)));
      if (sides.size === 1) owner[y]![x] = [...sides][0]!;
      else if (sides.size === 2 && !sh.has(posKey(x, y)))
        errors.push(`station ${t.station} at (${x}, ${y}) touches both kitchens and is not declared shared`);
    }),
  );
  return { errors, comp, owner };
}

// The map as one team sees it: the other kitchen is walled off (shared stations stay).
export const sideRows = (rows: readonly string[], g: Grid, lay: VersusLayout, side: 0 | 1, shared: ReadonlySet<string>): string[] =>
  rows.map((row, y) =>
    [...row]
      .map((c, x) => {
        const t = g[y]![x]!;
        return t.kind === 'wall' ||
          t.kind === 'water' ||
          lay.owner[y]![x] === side ||
          (lay.owner[y]![x] === null && shared.has(posKey(x, y)))
          ? c
          : '#';
      })
      .join(''),
  );
