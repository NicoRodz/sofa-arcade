// Versus validator: a map against its own metadata (twins, isolation, each kitchen solvable, fair).
import { MAP_H, MAP_W, parseMap, posKey, type Grid, type MapDef, type Pos, type VersusMapDef } from '../maps';
import { kitchenCost, spreadOf, type KitchenCost, type VersusReport } from './kitchen-cost';
import { VERSUS_TOL, sideRows, teamRange, versusLayout } from './versus-layout';
import { SIGMAS, isometryCheck } from '../maps/symmetry';
import { FLOOR_PER_PLAYER, floorTiles, minPlayers, spawnTiles, validate } from './reachability';
import { cardFor } from '../recipes/cards';
import { cardProblems, menuCardProblems } from '../recipes/card-check';
import { puestoProblems } from '../phone/puestos';
import { sabotageProblems } from './sabotage';

/**
 * A versus map against its own metadata. `requireMirror` (default true) demands the isometry keeps every tile (s = 1); with false a
 * map that is only equivalent (<= 3% apart on every cost metric) passes, but the spawns still have to be twins.
 */
export function validateVersus(m: VersusMapDef, opts: { requireMirror?: boolean; tol?: number } = {}): VersusReport {
  const tol = opts.tol ?? VERSUS_TOL;
  const empty: VersusReport = {
    ok: false,
    errors: [],
    s: 0,
    kitchens: null,
    spread: { routeCost: 0, firstStep: 0, interaction: 0, area: 0, shared: 0 },
  };
  const errors = empty.errors;
  if (m.rows.length !== MAP_H || m.rows.some((r) => r.length !== MAP_W)) {
    errors.push('bad size');
    return empty;
  }
  const g = parseMap(m.rows, true);
  const { sigma: sigmaName, spawns, shared = [] } = m.versus;
  const sigma = SIGMAS[sigmaName];
  // 1. isometry: both kitchens are twins
  const iso = isometryCheck(m.rows, sigma);
  empty.s = iso.s;
  if (!iso.valid) errors.push(`sigma ${sigmaName} is not an isometry of the grid`);
  if ((opts.requireMirror ?? true) && iso.s < 1)
    errors.push(
      `symmetry ${(iso.s * 100).toFixed(1)}% (a mirror map needs 100%): first mismatch at (${iso.mismatches[0]!.join(', ')}) against its twin`,
    );
  // 2. isolation and ownership
  const lay = versusLayout(g, sigmaName, shared);
  errors.push(...lay.errors);
  if (lay.errors.length) return empty;
  const sh = new Set(shared.map(([x, y]) => posKey(x, y)));
  for (const [x, y] of shared) if (g[y]?.[x]?.kind !== 'station') errors.push(`shared tile (${x}, ${y}) is not a station`);
  g.forEach((row, y) =>
    row.forEach((t, x) => {
      if (t.kind === 'station' && t.station !== 'counter' && lay.owner[y]![x] === null && !sh.has(posKey(x, y)))
        errors.push(`station ${t.station} at (${x}, ${y}) has no floor next to it`);
    }),
  );
  // 3. each kitchen as its own map: every station reachable, the recipe completes, spawns for every team size
  if (!(m.nMin >= 2 && m.nMin <= m.nMax && m.nMax <= 8)) errors.push(`players ${m.nMin}-${m.nMax} are not within 2..8`);
  const team = teamRange(m.nMin, m.nMax);
  const rowsOfSide = [0, 1].map((i) => sideRows(m.rows, g, lay, i as 0 | 1, sh)) as [string[], string[]];
  const sides = rowsOfSide.map((r) => parseMap(r, true)) as [Grid, Grid];
  sides.forEach((sg, i) => {
    const name = i ? 'B' : 'A';
    for (const e of validate(sg).errors) errors.push(`kitchen ${name}: ${e}`);
    const card = cardFor(m.id);
    if (card) for (const e of cardProblems(card, sg)) errors.push(`kitchen ${name}: ${e}`); // the same card in both kitchens: each must be able to make every recipe
    for (const e of menuCardProblems(m.id, sg)) errors.push(`kitchen ${name}: ${e}`); // ... and the menuV2 card, cut by difficulty
    const need = minPlayers(sg);
    if (need > team.min) errors.push(`kitchen ${name} needs ${need} chefs to finish the recipe but the smallest team has ${team.min}`);
    const s = spawnTiles(sg);
    if (s.length < team.max) errors.push(`kitchen ${name}: ${s.length} spawns for teams of up to ${team.max}`);
    const list = spawns[i]!;
    const key = (p: Pos) => posKey(...p);
    const set = new Set(s.map(key));
    if (list.length !== s.length || !list.every((p) => set.has(key(p))) || new Set(list.map(key)).size !== list.length)
      errors.push(`kitchen ${name}: the spawn order does not match its S tiles`);
    if (floorTiles(sg) < FLOOR_PER_PLAYER * team.max)
      errors.push(`kitchen ${name}: ${floorTiles(sg)} floor tiles for teams of ${team.max} (want ${FLOOR_PER_PLAYER} each)`);
    // a team of one chef plays the table of two (puestos never go below two), so the check starts at 2
    const probe: MapDef = {
      id: m.id,
      name: m.name,
      rows: rowsOfSide[i]!,
      nMin: Math.max(2, team.min),
      nMax: Math.max(2, team.max),
      minDuro: 1,
      stars: m.stars,
      spawns: list,
      puestos: m.puestos,
    };
    for (const e of puestoProblems(probe, true)) errors.push(`kitchen ${name}: ${e}`);
  });
  const twins = spawns[0].every((p, i) => {
    const [tx, ty] = sigma(p[0], p[1], MAP_W, MAP_H);
    const q = spawns[1][i];
    return q !== undefined && q[0] === tx && q[1] === ty;
  });
  if (!twins || spawns[0].length !== spawns[1].length) errors.push('kitchen B spawns are not sigma of kitchen A spawns, index by index');
  errors.push(...sabotageProblems(g, lay, sigma, spawns));
  // 4. fairness: the kitchens cost the same
  const costs = sides.map((sg, i) => kitchenCost(sg, spawns[i]!, shared)) as [KitchenCost, KitchenCost];
  empty.kitchens = costs;
  for (const k of Object.keys(costs[0]) as (keyof KitchenCost)[]) {
    const sp = spreadOf(costs[0][k], costs[1][k]);
    empty.spread[k] = sp;
    if (sp > tol)
      errors.push(`${k} differs ${(sp * 100).toFixed(1)}% between kitchens (${costs[0][k]} against ${costs[1][k]}; max ${tol * 100}%)`);
  }
  empty.ok = errors.length === 0;
  return empty;
}
