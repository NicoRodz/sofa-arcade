// Map solvability: floor components, zone graph over passing counters, recipe legs, spawns per zone.
import { puestoProblems } from './puestos';
import { DIRS, MAP_H, MAP_W, floorComponents, isFloor, parseMap, posKey, type Grid, type MapDef, type Pos, type VersusMapDef } from './maps';
import { SIGMAS, isometryCheck } from './symmetry';

export type StationKey = '1' | '2' | '3' | 'K' | 'O' | 'P' | 'E' | 'U' | 'L';
// 1 -> K, 2 -> K, K -> O (once per ingredient), P -> O, O -> E
export const RECIPE_LEGS: readonly (readonly [StationKey, StationKey])[] = [['1', 'K'], ['K', 'O'], ['2', 'K'], ['K', 'O'], ['P', 'O'], ['O', 'E']];
export const STATION_KEYS: readonly StationKey[] = ['1', '2', 'K', 'O', 'P', 'E']; // every map has these
// A map with a cheese crate ('3') also needs the cheese route: 3 -> K, then K -> O (already a leg).
// A map with a dirty-plate return (U) or a sink (L) needs both and the washing loop: U -> L (dirty plates), L -> O (clean plates to the ovens).
export const hasCheese = (g: Grid) => stationsOf(g, '3').length > 0;
export const hasSink = (g: Grid) => stationsOf(g, 'U').length > 0 || stationsOf(g, 'L').length > 0;
export const keysOf = (g: Grid): StationKey[] => [...STATION_KEYS, ...(hasCheese(g) ? (['3'] as const) : []), ...(hasSink(g) ? (['U', 'L'] as const) : [])];
export const legsOf = (g: Grid): (readonly [StationKey, StationKey])[] => [...RECIPE_LEGS, ...(hasCheese(g) ? ([['3', 'K']] as const) : []), ...(hasSink(g) ? ([['U', 'L'], ['L', 'O']] as const) : [])];

export function stationsOf(g: Grid, key: StationKey): Pos[] {
  const out: Pos[] = [];
  g.forEach((row, y) => row.forEach((t, x) => {
    if (t.kind !== 'station') return;
    const hit = key === '1' ? t.station === 'crate' && t.crate === 0
      : key === '2' ? t.station === 'crate' && t.crate === 1
      : key === '3' ? t.station === 'crate' && t.crate === 2
      : key === 'U' ? t.station === 'dirty'
      : key === 'L' ? t.station === 'sink'
      : key === 'K' ? t.station === 'board'
      : key === 'O' ? t.station === 'pot'
      : key === 'P' ? t.station === 'plates'
      : t.station === 'window';
    if (hit) out.push([x, y]);
  }));
  return out;
}

export function accessTiles(g: Grid, x: number, y: number): Pos[] {
  const out: Pos[] = [];
  for (const [dx, dy] of DIRS) if (isFloor(g, x + dx, y + dy)) out.push([x + dx, y + dy]);
  return out;
}

export interface Analysis {
  comp: number[][]; // floor component id per tile, -1 elsewhere
  count: number;
  spawns: number[]; // spawn tiles per component
  passes: { pos: Pos; comps: number[] }[]; // counters touching 2+ components: items cross there
  zone: number[]; // component -> zone id (components joined by passing counters share one)
}

export function analyze(g: Grid): Analysis {
  const { comp, count } = floorComponents(g);
  const spawns = Array<number>(count).fill(0);
  g.forEach((row, y) => row.forEach((t, x) => { if (t.kind === 'floor' && t.spawn) spawns[comp[y]![x]!]!++; }));
  const passes: Analysis['passes'] = [];
  g.forEach((row, y) => row.forEach((t, x) => {
    if (t.kind !== 'station' || t.station !== 'counter') return;
    const comps = [...new Set(accessTiles(g, x, y).map(([ax, ay]) => comp[ay]![ax]!))];
    if (comps.length >= 2) passes.push({ pos: [x, y], comps });
  }));
  const zone = Array.from({ length: count }, (_, i) => i);
  const find = (i: number): number => (zone[i] === i ? i : (zone[i] = find(zone[i]!)));
  for (const p of passes) for (const c of p.comps.slice(1)) zone[find(c)] = find(p.comps[0]!);
  return { comp, count, spawns, passes, zone: zone.map((_, i) => find(i)) };
}

export function validate(g: Grid): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  const a = analyze(g);
  if (!a.spawns.some((n) => n > 0)) errors.push('no spawn');
  const comps = new Map<StationKey, number[]>();
  const used = new Set<number>();
  for (const key of keysOf(g)) {
    const list = stationsOf(g, key);
    if (!list.length) { errors.push(`missing station ${key}`); comps.set(key, []); continue; }
    const cs: number[] = [];
    for (const [x, y] of list) {
      const acc = accessTiles(g, x, y);
      if (!acc.length) errors.push(`station ${key} at (${x}, ${y}) has no floor next to it`);
      for (const [ax, ay] of acc) { cs.push(a.comp[ay]![ax]!); used.add(a.comp[ay]![ax]!); }
    }
    comps.set(key, cs);
  }
  for (const c of used) if (!a.spawns[c]) errors.push(`floor region ${c} holds recipe stations but no spawn`);
  for (const [from, to] of legsOf(g)) {
    const zs = new Set((comps.get(to) ?? []).map((c) => a.zone[c]));
    if (!(comps.get(from) ?? []).some((c) => zs.has(a.zone[c]))) errors.push(`no route ${from} -> ${to}`);
  }
  return { ok: !errors.length, errors };
}

// Fewest players that can still finish the recipe: the smallest set of floor regions whose stations cover every recipe
// station kind (items cross regions through counters, but somebody has to stand at each station).
export function minPlayers(g: Grid): number {
  const a = analyze(g);
  const regions: Set<StationKey>[] = Array.from({ length: a.count }, () => new Set());
  const needed = new Set<StationKey>();
  for (const key of keysOf(g)) for (const [x, y] of stationsOf(g, key)) {
    needed.add(key);
    for (const [ax, ay] of accessTiles(g, x, y)) regions[a.comp[ay]![ax]!]!.add(key);
  }
  const ids = regions.map((_r, i) => i).filter((i) => regions[i]!.size);
  let best = ids.length;
  for (let mask = 1; mask < 1 << ids.length; mask++) {
    const size = ids.filter((_v, k) => mask & (1 << k)).length;
    if (size >= best) continue;
    const got = new Set<StationKey>();
    ids.forEach((id, k) => { if (mask & (1 << k)) regions[id]!.forEach((key) => got.add(key)); });
    if ([...needed].every((k) => got.has(k))) best = size;
  }
  return Math.max(1, best);
}

export const floorTiles = (g: Grid) => g.reduce((n, row) => n + row.filter((t) => t.kind === 'floor').length, 0);
export const spawnTiles = (g: Grid): Pos[] => {
  const out: Pos[] = [];
  g.forEach((row, y) => row.forEach((t, x) => { if (t.kind === 'floor' && t.spawn) out.push([x, y]); }));
  return out;
};
export const FLOOR_PER_PLAYER = 7; // design: at least 7 floor tiles per player at the map's maximum

// A fixed map against its own metadata: solvable, one spawn per player of its maximum, range and minDuro consistent.
export function validateMap(m: MapDef): { ok: boolean; errors: string[] } {
  if (m.rows.length !== MAP_H || m.rows.some((r) => r.length !== MAP_W)) return { ok: false, errors: ['bad size'] };
  const g = parseMap(m.rows);
  const errors = [...validate(g).errors];
  if (!(m.nMin >= 2 && m.nMin <= m.nMax && m.nMax <= 8)) errors.push(`range ${m.nMin}-${m.nMax} is not within 2..8`);
  if (m.minDuro > m.nMin) errors.push(`minDuro ${m.minDuro} is above nMin ${m.nMin}`);
  const mp = minPlayers(g);
  if (mp !== m.minDuro) errors.push(`minDuro is ${m.minDuro} but the recipe needs ${mp} floor regions`);
  const s = spawnTiles(g);
  if (s.length < m.nMax) errors.push(`${s.length} spawns for up to ${m.nMax} players`);
  if (m.spawns) {
    const key = (p: Pos) => posKey(...p);
    const set = new Set(s.map(key));
    if (!m.spawns.every((p) => set.has(key(p))) || new Set(m.spawns.map(key)).size !== m.spawns.length) errors.push('explicit spawn order does not match the S tiles');
  }
  errors.push(...puestoProblems(m));
  if (floorTiles(g) < FLOOR_PER_PLAYER * m.nMax) errors.push(`${floorTiles(g)} floor tiles for ${m.nMax} players (want ${FLOOR_PER_PLAYER} each)`);
  return { ok: !errors.length, errors };
}

// Share of one pizza's actions (picks, board work, oven loads and takes, plate, delivery, washing) that each floor region
// receives. A station touching two regions (a counter or an oven in a wall) splits its share. Design: a region with a spawn
// must get at least 15% or its players have nothing to do.
export const MIN_ZONE_SHARE = 0.15;
export function zoneShares(g: Grid): number[] {
  const a = analyze(g);
  const ingredients = hasCheese(g) ? 3 : 2;
  const actions: [StationKey, number][] = [['1', 1], ['2', 1], ...(hasCheese(g) ? ([['3', 1]] as [StationKey, number][]) : []),
    ['K', 2 * ingredients], ['O', ingredients + 1], ['P', 1], ['E', 1], ...(hasSink(g) ? ([['U', 1], ['L', 3]] as [StationKey, number][]) : [])];
  const w = Array<number>(a.count).fill(0);
  for (const [key, weight] of actions) {
    const list = stationsOf(g, key);
    for (const [x, y] of list) {
      const comps = [...new Set(accessTiles(g, x, y).map(([ax, ay]) => a.comp[ay]![ax]!))];
      for (const c of comps) w[c]! += weight / list.length / comps.length;
    }
  }
  const total = w.reduce((n, v) => n + v, 0) || 1;
  return w.map((v) => v / total);
}
export const zoneShareProblems = (g: Grid): string[] => {
  const a = analyze(g), shares = zoneShares(g);
  return shares.flatMap((sh, c) => (a.spawns[c]! > 0 && a.count > 1 && sh < MIN_ZONE_SHARE ? [`region ${c} gets ${(sh * 100).toFixed(0)}% of the actions (< ${MIN_ZONE_SHARE * 100}%)`] : []));
};

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
  const h = g.length, w = g[0]?.length ?? 0;
  const sigma = SIGMAS[sigmaName];
  const errors: string[] = [];
  const sh = new Set(shared.map(([x, y]) => posKey(x, y)));
  const { comp, count } = floorComponents(g);
  const owner: VersusLayout['owner'] = g.map((row) => row.map(() => null));
  const fail = (): VersusLayout => ({ errors, comp, owner });
  // image of every floor region
  const image = Array<number>(count).fill(-1);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!isFloor(g, x, y)) continue;
    const [tx, ty] = sigma(x, y, w, h);
    if (!isFloor(g, tx, ty)) { errors.push(`floor (${x}, ${y}) has no floor twin at (${tx}, ${ty})`); return fail(); }
    const c = comp[y]![x]!, ic = comp[ty]![tx]!;
    if (image[c]! < 0) image[c] = ic;
    else if (image[c] !== ic) { errors.push(`floor region ${c} is not sent onto one region by sigma`); return fail(); }
  }
  const cross = image.findIndex((ic, c) => ic === c);
  if (cross >= 0) { errors.push(`floor region ${cross} is its own twin: it crosses the barrier`); return fail(); }
  // kitchens: regions joined through counters (items cross there), except declared shared tiles
  const root = Array.from({ length: count }, (_v, i) => i);
  const find = (i: number): number => (root[i] === i ? i : (root[i] = find(root[i]!)));
  const joins: { pos: Pos; comps: number[] }[] = [];
  g.forEach((row, y) => row.forEach((t, x) => {
    if (t.kind !== 'station' || t.station !== 'counter' || sh.has(posKey(x, y))) return;
    const comps = [...new Set(accessTiles(g, x, y).map(([ax, ay]) => comp[ay]![ax]!))];
    for (const c of comps.slice(1)) root[find(c)] = find(comps[0]!);
    if (comps.length > 1) joins.push({ pos: [x, y], comps });
  }));
  const rootOf = (c: number) => find(c);
  const roots = [...new Set(Array.from({ length: count }, (_v, c) => rootOf(c)))];
  const linked = Array.from({ length: count }, (_v, c) => c).find((c) => rootOf(c) === rootOf(image[c]!));
  if (linked !== undefined) {
    const via = joins.find((j) => j.comps.some((c) => rootOf(c) === rootOf(linked)));
    errors.push(via ? `the kitchens are connected: counter at (${via.pos[0]}, ${via.pos[1]}) joins them` : `floor regions ${linked} and ${image[linked]} are connected`);
    return fail();
  }
  if (roots.length !== 2) { errors.push(`found ${roots.length} kitchens, expected 2`); return fail(); }
  const first = comp.flat().find((c) => c >= 0);
  const sideOf = (c: number): 0 | 1 => (rootOf(c) === rootOf(first ?? 0) ? 0 : 1);
  g.forEach((row, y) => row.forEach((t, x) => {
    if (t.kind === 'floor') { owner[y]![x] = sideOf(comp[y]![x]!); return; }
    if (t.kind !== 'station') return;
    const sides = new Set(accessTiles(g, x, y).map(([ax, ay]) => sideOf(comp[ay]![ax]!)));
    if (sides.size === 1) owner[y]![x] = [...sides][0]!;
    else if (sides.size === 2 && !sh.has(posKey(x, y))) errors.push(`station ${t.station} at (${x}, ${y}) touches both kitchens and is not declared shared`);
  }));
  return { errors, comp, owner };
}

// The map as one team sees it: the other kitchen is walled off (shared stations stay).
const sideRows = (rows: readonly string[], g: Grid, lay: VersusLayout, side: 0 | 1, shared: ReadonlySet<string>): string[] =>
  rows.map((row, y) => [...row].map((c, x) => {
    const t = g[y]![x]!;
    return t.kind === 'wall' || t.kind === 'water' || lay.owner[y]![x] === side || (lay.owner[y]![x] === null && shared.has(posKey(x, y))) ? c : '#';
  }).join(''));

// BFS distance over floor tiles from a set of tiles; Infinity where it does not reach.
function floorDistances(g: Grid, from: readonly Pos[]): number[][] {
  const d = g.map((row) => row.map(() => Infinity));
  const queue: Pos[] = [];
  for (const [x, y] of from) if (isFloor(g, x, y) && d[y]![x] === Infinity) { d[y]![x] = 0; queue.push([x, y]); }
  for (let i = 0; i < queue.length; i++) {
    const [x, y] = queue[i]!;
    for (const [dx, dy] of DIRS) {
      const nx = x + dx, ny = y + dy;
      if (isFloor(g, nx, ny) && d[ny]![nx] === Infinity) { d[ny]![nx] = d[y]![x]! + 1; queue.push([nx, ny]); }
    }
  }
  return d;
}
const nearest = (d: number[][], tiles: readonly Pos[]) => tiles.reduce((m, [x, y]) => Math.min(m, d[y]![x]!), Infinity);
const accessOf = (g: Grid, key: StationKey) => stationsOf(g, key).flatMap(([x, y]) => accessTiles(g, x, y));

export interface KitchenCost {
  routeCost: number; // sum over the recipe legs of the shortest walk between the leg's two station kinds
  firstStep: number; // sum over the team's spawns of the walk to the nearest dough crate
  interaction: number; // floor tiles next to some station other than a counter
  area: number; // floor tiles
  shared: number; // sum over the shared stations this kitchen touches of the walks from its spawns
}
export interface VersusReport {
  ok: boolean;
  errors: string[];
  s: number; // share of tiles equal to their twin (1 for a mirror map)
  kitchens: [KitchenCost, KitchenCost] | null;
  spread: Record<keyof KitchenCost, number>; // relative difference between the two kitchens, per metric
}

function kitchenCost(g: Grid, spawns: readonly Pos[], shared: readonly Pos[]): KitchenCost {
  let routeCost = 0;
  for (const [from, to] of legsOf(g)) {
    const d = floorDistances(g, accessOf(g, from));
    const best = nearest(d, accessOf(g, to));
    routeCost += Number.isFinite(best) ? best : 99; // an unreachable leg is reported as an error elsewhere
  }
  const dough = accessOf(g, '1');
  const firstStep = spawns.reduce((n, sp) => n + Math.min(99, nearest(floorDistances(g, [sp]), dough)), 0);
  const touched = new Set<string>();
  g.forEach((row, y) => row.forEach((t, x) => { if (t.kind === 'station' && t.station !== 'counter') for (const [ax, ay] of accessTiles(g, x, y)) touched.add(posKey(ax, ay)); }));
  let sharedCost = 0;
  for (const [x, y] of shared) if (g[y]?.[x]?.kind === 'station') {
    const access = accessTiles(g, x, y);
    sharedCost += spawns.reduce((n, sp) => n + Math.min(99, nearest(floorDistances(g, [sp]), access)), 0);
  }
  return { routeCost, firstStep, interaction: touched.size, area: floorTiles(g), shared: sharedCost };
}
const spreadOf = (a: number, b: number) => (a === b ? 0 : Math.abs(a - b) / Math.max(a, b));

/**
 * A versus map against its own metadata. `requireMirror` (default true) demands the isometry keeps every tile (s = 1); with false a
 * map that is only equivalent (<= 3% apart on every cost metric) passes, but the spawns still have to be twins.
 */
export function validateVersus(m: VersusMapDef, opts: { requireMirror?: boolean; tol?: number } = {}): VersusReport {
  const tol = opts.tol ?? VERSUS_TOL;
  const empty: VersusReport = { ok: false, errors: [], s: 0, kitchens: null, spread: { routeCost: 0, firstStep: 0, interaction: 0, area: 0, shared: 0 } };
  const errors = empty.errors;
  if (m.rows.length !== MAP_H || m.rows.some((r) => r.length !== MAP_W)) { errors.push('bad size'); return empty; }
  const g = parseMap(m.rows);
  const { sigma: sigmaName, spawns, shared = [] } = m.versus;
  const sigma = SIGMAS[sigmaName];
  // 1. isometry: both kitchens are twins
  const iso = isometryCheck(m.rows, sigma);
  empty.s = iso.s;
  if (!iso.valid) errors.push(`sigma ${sigmaName} is not an isometry of the grid`);
  if ((opts.requireMirror ?? true) && iso.s < 1) errors.push(`symmetry ${(iso.s * 100).toFixed(1)}% (a mirror map needs 100%): first mismatch at (${iso.mismatches[0]!.join(', ')}) against its twin`);
  // 2. isolation and ownership
  const lay = versusLayout(g, sigmaName, shared);
  errors.push(...lay.errors);
  if (lay.errors.length) return empty;
  const sh = new Set(shared.map(([x, y]) => posKey(x, y)));
  for (const [x, y] of shared) if (g[y]?.[x]?.kind !== 'station') errors.push(`shared tile (${x}, ${y}) is not a station`);
  g.forEach((row, y) => row.forEach((t, x) => {
    if (t.kind === 'station' && t.station !== 'counter' && lay.owner[y]![x] === null && !sh.has(posKey(x, y))) errors.push(`station ${t.station} at (${x}, ${y}) has no floor next to it`);
  }));
  // 3. each kitchen as its own map: every station reachable, the recipe completes, spawns for every team size
  if (!(m.nMin >= 2 && m.nMin <= m.nMax && m.nMax <= 8)) errors.push(`players ${m.nMin}-${m.nMax} are not within 2..8`);
  const team = teamRange(m.nMin, m.nMax);
  const rowsOfSide = [0, 1].map((i) => sideRows(m.rows, g, lay, i as 0 | 1, sh)) as [string[], string[]];
  const sides = rowsOfSide.map((r) => parseMap(r)) as [Grid, Grid];
  sides.forEach((sg, i) => {
    const name = i ? 'B' : 'A';
    for (const e of validate(sg).errors) errors.push(`kitchen ${name}: ${e}`);
    const need = minPlayers(sg);
    if (need > team.min) errors.push(`kitchen ${name} needs ${need} chefs to finish the recipe but the smallest team has ${team.min}`);
    const s = spawnTiles(sg);
    if (s.length < team.max) errors.push(`kitchen ${name}: ${s.length} spawns for teams of up to ${team.max}`);
    const list = spawns[i]!;
    const key = (p: Pos) => posKey(...p);
    const set = new Set(s.map(key));
    if (list.length !== s.length || !list.every((p) => set.has(key(p))) || new Set(list.map(key)).size !== list.length) errors.push(`kitchen ${name}: the spawn order does not match its S tiles`);
    if (floorTiles(sg) < FLOOR_PER_PLAYER * team.max) errors.push(`kitchen ${name}: ${floorTiles(sg)} floor tiles for teams of ${team.max} (want ${FLOOR_PER_PLAYER} each)`);
    // a team of one chef plays the table of two (puestos never go below two), so the check starts at 2
    const probe: MapDef = { id: m.id, name: m.name, rows: rowsOfSide[i]!, nMin: Math.max(2, team.min), nMax: Math.max(2, team.max), minDuro: 1, stars: m.stars, spawns: list, puestos: m.puestos };
    for (const e of puestoProblems(probe)) errors.push(`kitchen ${name}: ${e}`);
  });
  const twins = spawns[0].every((p, i) => { const [tx, ty] = sigma(p[0], p[1], MAP_W, MAP_H); const q = spawns[1][i]; return q !== undefined && q[0] === tx && q[1] === ty; });
  if (!twins || spawns[0].length !== spawns[1].length) errors.push('kitchen B spawns are not sigma of kitchen A spawns, index by index');
  // 4. fairness: the kitchens cost the same
  const costs = sides.map((sg, i) => kitchenCost(sg, spawns[i]!, shared)) as [KitchenCost, KitchenCost];
  empty.kitchens = costs;
  for (const k of Object.keys(costs[0]) as (keyof KitchenCost)[]) {
    const sp = spreadOf(costs[0][k], costs[1][k]);
    empty.spread[k] = sp;
    if (sp > tol) errors.push(`${k} differs ${(sp * 100).toFixed(1)}% between kitchens (${costs[0][k]} against ${costs[1][k]}; max ${tol * 100}%)`);
  }
  empty.ok = errors.length === 0;
  return empty;
}
