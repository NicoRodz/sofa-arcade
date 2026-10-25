// Seeded kitchen generator: topology + loose obstacles + station slots + spawns, retried until it validates and lands in
// the difficulty band. Same seed, difficulty, team size (and range) give the same map. It builds for a range of team sizes
// [nMin, nMax]: spawns and stations are sized for nMax and every N of the range is checked (puestos reachable, floor per chef).
// Topologies (design: abierta, islas, carriles, zonas2 or zonas3) map to open, island, lanes and river/corridor (zonas2);
// zonas3 (three rooms) is not generated: the fixed maps 13 and 15 cover it.
import type { Difficulty } from '@pichi/core/difficulty';
import { teamSize } from '@pichi/core/difficulty';
import {
  MAPS_BY_DIFFICULTY,
  MAP_H,
  MAP_W,
  fixedMap,
  parseMap,
  pickFixedMap,
  posKey,
  recommendedMaps,
  type MapChoice,
  type MapDef,
  type Pos,
  type SigmaName,
  type VersusMapDef,
} from './maps';
import { PUESTOS, puestosFor, type Features, type PuestoId } from './puestos';
import { mulberry32, pick, pickWeighted, randInt, type Rng } from '@pichi/core/rng';
import { metric } from './score';
import {
  FLOOR_PER_PLAYER,
  accessTiles,
  analyze,
  floorTiles,
  minPlayers,
  spawnTiles,
  teamRange,
  validateMap,
  validateVersus,
  zoneShareProblems,
} from './validate';
import { SIGMAS } from './symmetry';
import { VERSUS_BASE_MAPS } from './versus/maps';

export const ARCHETYPES = ['open', 'island', 'lanes', 'river', 'corridor'] as const;
export type Archetype = (typeof ARCHETYPES)[number];
export const MAX_ATTEMPTS = 200;

const WEIGHTS: Record<Difficulty, Record<Archetype, number>> = {
  easy: { open: 0.6, island: 0.4, lanes: 0, river: 0, corridor: 0 },
  normal: { open: 0.1, island: 0.25, lanes: 0.15, river: 0.25, corridor: 0.25 },
  hard: { open: 0, island: 0, lanes: 0.2, river: 0.4, corridor: 0.4 },
};
const OBSTACLES: Record<Difficulty, number> = { easy: 0, normal: 2, hard: 4 };
// D band per difficulty: easy < 50, normal 50..70, hard > 70.
const BAND: Record<Difficulty, [number, number]> = { easy: [-Infinity, 50], normal: [50, 70], hard: [70, Infinity] };
export const inBand = (d: number, diff: Difficulty) => {
  const [lo, hi] = BAND[diff];
  return diff === 'easy' ? d < hi : diff === 'hard' ? d > lo : d >= lo && d <= hi;
};
const bandDist = (d: number, diff: Difficulty) => (inBand(d, diff) ? 0 : Math.max(BAND[diff][0] - d, d - BAND[diff][1]));

// Mechanics a generated map may bring. Washing only exists from 5 players (design: U and L only if sink and N >= 5).
export type Mech = Features;
export const NO_MECH: Mech = { cheese: false, sink: false };

// Design 15-mapas §5: ovens ceil(N/3), boards ceil((N+1)/3) (+1 with cheese), E and P 1+floor(N/5), X 1+floor(N/4),
// U and L one each with washing. Hard keeps its one board less (the difficulty selector still matters).
export function stationCounts(n: number, diff: Difficulty, mech: Mech = NO_MECH) {
  const t = teamSize(n);
  const boards = Math.max(1, Math.ceil((t + 1) / 3) + (mech.cheese ? 1 : 0) - (diff === 'hard' ? 1 : 0));
  return {
    boards,
    ovens: Math.ceil(t / 3),
    crates: t >= 6 ? 2 : 1,
    cheese: mech.cheese ? 1 : 0,
    serve: 1 + Math.floor(t / 5),
    trash: 1 + Math.floor(t / 4),
    wash: mech.sink && t >= 5 ? 1 : 0,
  };
}

export type Cells = string[][];
type Zone = 'A' | 'B';
export interface Layout {
  cells: Cells;
  zoneAt: ((x: number) => Zone) | null;
  blockX: [number, number] | null;
}

const shell = (): Cells =>
  Array.from({ length: MAP_H }, (_, y) =>
    Array.from({ length: MAP_W }, (_, x) => {
      if (x > 0 && x < MAP_W - 1 && y > 0 && y < MAP_H - 1) return '.';
      const corner = y === 0 || y === MAP_H - 1 ? x < 2 || x >= MAP_W - 2 : y === 1 || y === MAP_H - 2;
      return corner ? '#' : 'C';
    }),
  );

export function applyArchetype(arch: Archetype, diff: Difficulty, rng: Rng): Layout {
  const cells = shell();
  if (arch === 'island') {
    const w = randInt(rng, 3, 7),
      h = randInt(rng, 1, 2);
    const x0 = Math.floor((MAP_W - w) / 2) + randInt(rng, -1, 1),
      y0 = h === 2 ? 3 : 4;
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) cells[y]![x] = 'C';
    return { cells, zoneAt: null, blockX: null };
  }
  if (arch === 'lanes') {
    // two counter rows split the kitchen into three lanes joined at both ends (like Tres carriles)
    const len = randInt(rng, 6, 10),
      x0 = randInt(rng, 3, 13 - len);
    for (const y of [3, 5]) for (let x = x0; x < x0 + len; x++) cells[y]![x] = 'C';
    return { cells, zoneAt: null, blockX: null };
  }
  if (arch === 'river') {
    const xr = randInt(rng, 6, 9);
    for (let y = 0; y < MAP_H; y++) cells[y]![xr] = '~';
    const want = diff === 'hard' ? randInt(rng, 1, 2) : 3;
    const rows: number[] = [];
    for (let tries = 0; rows.length < want && tries < 50; tries++) {
      const y = randInt(rng, 1, MAP_H - 2);
      if (rows.every((r) => Math.abs(r - y) >= 2)) rows.push(y);
    }
    for (const y of rows) cells[y]![xr] = 'C';
    return { cells, zoneAt: (x) => (x < xr ? 'A' : 'B'), blockX: [xr, xr + 1] };
  }
  if (arch === 'corridor') {
    const len = randInt(rng, 2, 5),
      a = randInt(rng, 4, 12 - len),
      gap = randInt(rng, 2, 6);
    for (let x = a; x < a + len; x++) for (let y = 0; y < MAP_H; y++) cells[y]![x] = y === gap ? '.' : '#';
    return { cells, zoneAt: (x) => (x < a + len / 2 ? 'A' : 'B'), blockX: [a, a + len] };
  }
  return { cells, zoneAt: null, blockX: null };
}

const rowsOf = (cells: Cells) => cells.map((r) => r.join(''));
export const shape = (cells: Cells) => {
  const a = analyze(parseMap(rowsOf(cells)));
  return `${a.count}/${a.passes.length}`;
};

export interface Bounds {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}
const WHOLE_MAP: Bounds = { x0: 2, x1: MAP_W - 3, y0: 2, y1: MAP_H - 3 };

export function scatterObstacles(cells: Cells, count: number, rng: Rng, within: Bounds = WHOLE_MAP) {
  for (let i = 0; i < count; i++) {
    const before = shape(cells);
    for (let tries = 0; tries < 10; tries++) {
      const x = randInt(rng, within.x0, within.x1),
        y = randInt(rng, within.y0, within.y1);
      if (cells[y]![x] !== '.') continue;
      cells[y]![x] = 'C';
      if (shape(cells) === before) break;
      cells[y]![x] = '.';
    }
  }
}

export function placeStations(l: Layout, n: number, diff: Difficulty, rng: Rng, mech: Mech = NO_MECH): Set<string> | null {
  const { cells, zoneAt } = l;
  const grid = parseMap(rowsOf(cells));
  const passes = new Set(analyze(grid).passes.map((p) => posKey(...p.pos)));
  const claimed = new Set<string>();
  const c = stationCounts(n, diff, mech);
  const times = (ch: string, count: number, zone: Zone): [string, Zone][] => Array.from({ length: count }, () => [ch, zone]);
  const order: [string, Zone][] = [
    ...times('E', c.serve, diff === 'hard' ? 'A' : 'B'),
    ...times('O', c.ovens, 'B'),
    ...times('P', c.serve, 'B'),
    ...times('K', c.boards, 'A'),
    ...times('1', c.crates, 'A'),
    ...times('2', c.crates, 'A'),
    ...times('3', c.cheese, 'A'),
    ...times('U', c.wash, 'B'),
    ...times('L', c.wash, 'B'),
    ...times('X', c.trash, 'A'),
  ];
  for (const [ch, zone] of order) {
    const slots: { at: Pos; acc: Pos }[] = [];
    cells.forEach((row, y) =>
      row.forEach((cell, x) => {
        if (cell !== 'C' || passes.has(posKey(x, y))) return;
        const acc = accessTiles(parseMap(rowsOf(cells)), x, y).find(
          ([ax, ay]) => !claimed.has(posKey(ax, ay)) && (!zoneAt || zoneAt(ax) === zone),
        );
        if (acc) slots.push({ at: [x, y], acc });
      }),
    );
    if (!slots.length) return null;
    const s = pick(rng, slots);
    cells[s.at[1]]![s.at[0]] = ch;
    claimed.add(posKey(...s.acc));
  }
  return claimed;
}

// Spawns: floor tiles that are nobody's access tile, 2+ apart, alternating zones when the map has them. One per chef of nMax.
function placeSpawns(l: Layout, nMax: number, claimed: Set<string>, rng: Rng): boolean {
  const { cells, zoneAt, blockX } = l;
  const chosen: Pos[] = [];
  for (let i = 0; i < teamSize(nMax); i++) {
    const want: Zone | null = zoneAt ? (i % 2 ? 'B' : 'A') : null;
    const cand: Pos[] = [];
    cells.forEach((row, y) =>
      row.forEach((c, x) => {
        if (c !== '.' || claimed.has(posKey(x, y))) return;
        if (blockX && x >= blockX[0] && x < blockX[1]) return;
        if (want && zoneAt!(x) !== want) return;
        if (chosen.every(([cx, cy]) => Math.abs(cx - x) + Math.abs(cy - y) >= 2)) cand.push([x, y]);
      }),
    );
    if (!cand.length) return false;
    const [x, y] = pick(rng, cand);
    cells[y]![x] = 'S';
    chosen.push([x, y]);
  }
  return true;
}

// Orders the spawns like the puesto table: spawn i goes next to the stations of puesto i (greedy, first puesto first).
// Zone maps keep their alternating order (their puestos are assigned by zone instead, see zonePuestos).
export function orderSpawns(rows: readonly string[], spawns: readonly Pos[], nMax: number, mech: Mech): Pos[] {
  const g = parseMap(rows);
  const stations: { kind: string; crate: number; x: number; y: number }[] = [];
  g.forEach((row, y) =>
    row.forEach((t, x) => {
      if (t.kind === 'station') stations.push({ kind: t.station, crate: t.crate, x, y });
    }),
  );
  const left = [...spawns];
  const out: Pos[] = [];
  for (const ids of puestosFor(nMax, mech)) {
    if (!left.length) break;
    const cost = (sp: Pos) =>
      ids.reduce(
        (sum, id) =>
          sum +
          PUESTOS[id].picks.reduce((s2, pick2) => {
            const d = stations
              .filter((s) => s.kind === pick2.kind && (pick2.crate === undefined || s.crate === pick2.crate))
              .map((s) => Math.abs(s.x - sp[0]) + Math.abs(s.y - sp[1]));
            return s2 + (d.length ? Math.min(...d) : 0);
          }, 0),
        0,
      );
    let best = 0;
    left.forEach((sp, i) => {
      if (cost(sp) < cost(left[best]!)) best = i;
    });
    out.push(left.splice(best, 1)[0]!);
  }
  return [...out, ...left];
}

// Puestos of a two-zone map by zone (A: boards and crates; B: ovens and plates; E on A for hard): the default table would
// ask a chef for stations on the other bank.
export function zonePuestos(spawns: readonly Pos[], zoneAt: (x: number) => Zone, serveInA: boolean, mech: Mech): PuestoId[][] {
  const zones = spawns.map(([x]) => zoneAt(x));
  const lastOf = (z: Zone) => zones.lastIndexOf(z);
  return spawns.map((_sp, i) => {
    const z = zones[i]!;
    const alone = zones.filter((v) => v === z).length === 1;
    if (z === 'A') return serveInA && i === lastOf('A') ? (alone ? ['prep', 'entrega'] : ['entrega']) : ['prep'];
    const base: PuestoId[] = serveInA ? ['horno', 'platos'] : ['horno', 'reparto'];
    if (mech.sink && i === lastOf('B')) return alone ? [...base, 'lavado'] : ['lavado'];
    return base;
  });
}

export interface Generated {
  rows: string[];
  archetype: Archetype | 'fixed';
  d: number;
  inBand: boolean;
  attempts: number;
  nMin: number;
  nMax: number;
  mech: Mech;
  spawns?: Pos[]; // chef order (spawn i = puesto i); fixed fallbacks use the map's own
  puestos?: PuestoId[][]; // zone maps only
}
export interface GenOpts {
  nMin?: number;
  nMax?: number;
  mech?: Mech;
}

// Cheese from 3 players on (often), washing from 5: decided by the seed so the same seed gives the same kitchen.
export function pickMech(seed: number, nMax: number): Mech {
  const r = mulberry32(seed ^ 0x9e3779b9);
  const t = teamSize(nMax);
  const cheese = t >= 3 && r() < (t >= 5 ? 0.8 : 0.5);
  const sink = t >= 5 && r() < 0.6;
  return { cheese, sink };
}

export function generate(seed: number, diff: Difficulty, n: number, maxAttempts = MAX_ATTEMPTS, opts: GenOpts = {}): Generated {
  const t = teamSize(n);
  const nMax = teamSize(opts.nMax ?? t),
    nMin = Math.min(teamSize(opts.nMin ?? t), nMax);
  const mech = opts.mech ?? pickMech(seed, nMax);
  const rng = mulberry32(seed);
  let best: Generated | null = null;
  for (let i = 1; i <= maxAttempts; i++) {
    const arch = pickWeighted(rng, WEIGHTS[diff]);
    const layout = applyArchetype(arch, diff, rng);
    scatterObstacles(layout.cells, OBSTACLES[diff], rng);
    const claimed = placeStations(layout, nMax, diff, rng, mech);
    if (!claimed || !placeSpawns(layout, nMax, claimed, rng)) continue;
    const rows = rowsOf(layout.cells);
    const grid = parseMap(rows);
    if (floorTiles(grid) < FLOOR_PER_PLAYER * nMax) continue;
    const sp = spawnTiles(grid);
    const zoneAt = layout.zoneAt;
    const ordered = zoneAt ? alternate(sp, zoneAt) : orderSpawns(rows, sp, nMax, mech); // zone maps alternate A, B, A, B...
    const puestos = zoneAt ? zonePuestos(ordered, zoneAt, diff === 'hard', mech) : undefined;
    const def: MapDef = { id: 'gen', name: 'gen', rows, nMin, nMax, minDuro: minPlayers(grid), stars: 2, spawns: ordered, puestos };
    if (!validateMap(def).ok || zoneShareProblems(grid).length) continue; // solvable, spawns and puestos fit every N of the range, no idle zone
    const d = metric(grid, t).D;
    const g: Generated = { rows, archetype: arch, d, inBand: inBand(d, diff), attempts: i, nMin, nMax, mech, spawns: ordered, puestos };
    if (g.inBand) return g;
    if (!best || bandDist(d, diff) < bandDist(best.d, diff)) best = g;
  }
  if (best) return best;
  // Nothing validated: the first fixed map of the difficulty that fits N, else any map recommended for N
  const fits = (id: string) => {
    const m = fixedMap(id)!;
    return m.nMin <= nMax && m.nMax >= nMin;
  };
  const fb = fixedMap(MAPS_BY_DIFFICULTY[diff].find(fits) ?? recommendedMaps(t)[0]?.id ?? MAPS_BY_DIFFICULTY[diff][0]!)!;
  return {
    rows: [...fb.rows],
    archetype: 'fixed',
    d: metric(parseMap(fb.rows), t).D,
    inBand: false,
    attempts: maxAttempts,
    nMin: fb.nMin,
    nMax: fb.nMax,
    mech: { cheese: fb.rows.some((r) => r.includes('3')), sink: fb.rows.some((r) => r.includes('L')) },
    spawns: fb.spawns ? [...fb.spawns] : undefined,
    puestos: fb.puestos?.map((p) => [...p]),
  };
}

// A, B, A, B... by zone, keeping reading order inside each zone (what placeSpawns produced).
function alternate(spawns: readonly Pos[], zoneAt: (x: number) => Zone): Pos[] {
  const a = spawns.filter(([x]) => zoneAt(x) === 'A'),
    b = spawns.filter(([x]) => zoneAt(x) === 'B');
  const out: Pos[] = [];
  for (let i = 0; out.length < spawns.length; i++) {
    if (a[i]) out.push(a[i]!);
    if (b[i]) out.push(b[i]!);
  }
  return out;
}

// The map a lobby choice stands for. "random" is generated from the lobby seed; the rest are fixed maps.
export function resolveMap(
  choice: MapChoice,
  seed: number,
  diff: Difficulty,
  n: number,
  rand: Rng,
): { id: string; name: string; rows: readonly string[]; spawns?: readonly Pos[]; puestos?: MapDef['puestos'] } {
  if (choice === 'random') {
    const g = generate(seed, diff, n);
    return { id: 'random', name: `Aleatorio ${seed}`, rows: g.rows, spawns: g.spawns, puestos: g.puestos };
  }
  const m = pickFixedMap(choice, diff, rand, n);
  return { id: m.id, name: m.name, rows: m.rows, spawns: m.spawns, puestos: m.puestos };
}

// --- Versus ----------------------------------------------------------------------------------------------------------------------
// Design pizzas-modalidades-coop-versus §2 (generator): half a kitchen is generated with the machinery above and reflected through
// sigma. 'side' is a half of 8 columns (0-7, column 7 is the barrier) mirrored left to right; 'stack' is a half of 4 rows (0-3, row 4
// is the barrier) turned half a turn. The same seed gives the same map; attempts are bounded and every candidate has to pass
// validateVersus, so what comes out is always a legal duel (or, after MAX_ATTEMPTS failures, one of the fixed maps).
export type VersusTopology = 'side' | 'stack';
export const VERSUS_TOPOLOGIES: Record<VersusTopology, SigmaName> = { side: 'mirrorX', stack: 'rot180' };
type HalfArchetype = 'open' | 'island' | 'lanes';
const HALF_WEIGHTS: Record<Difficulty, Record<HalfArchetype, number>> = {
  easy: { open: 0.6, island: 0.4, lanes: 0 },
  normal: { open: 0.15, island: 0.45, lanes: 0.4 },
  hard: { open: 0, island: 0.35, lanes: 0.65 },
};
// Where loose obstacles may fall inside a half
const HALF_BOUNDS: Record<VersusTopology, Bounds> = { side: { x0: 2, x1: 5, y0: 2, y1: 6 }, stack: { x0: 2, x1: 13, y0: 1, y1: 3 } };

// The half in a full 16x9 grid: walls everywhere except the half's own shell (counters) and floor, so the usual placement and
// validation code works on it unchanged. The barrier edge is wall.
export function halfLayout(topology: VersusTopology): Layout {
  const cells: Cells = Array.from({ length: MAP_H }, () => Array.from({ length: MAP_W }, () => '#'));
  const [w, h] = topology === 'side' ? [7, MAP_H] : [MAP_W, 4]; // kept area: x < w (column 7 stays wall) and y < h (row 4 stays wall)
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const edgeX = x === 0 || (topology === 'stack' && x === MAP_W - 1),
        edgeY = y === 0 || (topology === 'side' && y === MAP_H - 1);
      const corner = edgeX && edgeY;
      cells[y]![x] = corner ? '#' : edgeX || edgeY ? 'C' : '.';
    }
  return { cells, zoneAt: null, blockX: null };
}

function applyHalfArchetype(arch: HalfArchetype, topology: VersusTopology, cells: Cells, rng: Rng) {
  const fill = (x0: number, y0: number, w: number, h: number) => {
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) cells[y]![x] = 'C';
  };
  if (arch === 'island') {
    if (topology === 'side') {
      const w = randInt(rng, 2, 3),
        h = randInt(rng, 1, 2);
      fill(randInt(rng, 2, 6 - w), randInt(rng, 3, 7 - h), w, h);
    } else {
      const w = randInt(rng, 3, 5);
      fill(randInt(rng, 3, 13 - w), 2, w, 1);
    }
  } else if (arch === 'lanes') {
    // a strip along the kitchen: two lanes joined at both ends
    if (topology === 'side') {
      const len = randInt(rng, 3, 5);
      fill(randInt(rng, 3, 4), randInt(rng, 2, 7 - len), 1, len);
    } else {
      const len = randInt(rng, 6, 10);
      fill(randInt(rng, 3, 13 - len), 2, len, 1);
    }
  }
}

// The whole map from its half: every tile of the kept area is copied onto its twin.
export function composeVersus(half: readonly string[], topology: VersusTopology): string[] {
  const sigma = SIGMAS[VERSUS_TOPOLOGIES[topology]];
  const out = half.map((r) => [...r]);
  for (let y = 0; y < MAP_H; y++)
    for (let x = 0; x < MAP_W; x++) {
      const [tx, ty] = sigma(x, y, MAP_W, MAP_H);
      const inHalf = topology === 'side' ? x <= 7 : y <= 3;
      if (!inHalf) out[y]![x] = half[ty]![tx]!;
    }
  return out.map((r) => r.join(''));
}

export interface GeneratedVersus {
  rows: string[];
  topology: VersusTopology;
  sigma: SigmaName;
  archetype: HalfArchetype | 'fixed';
  d: number; // difficulty metric of one kitchen, reported but not enforced (a half kitchen is calibrated differently from a coop one)
  attempts: number;
  fallback: boolean; // fallback: nothing validated and a fixed versus map came back
  nMin: number;
  nMax: number; // TOTAL players
  mech: Mech;
  spawns: VersusMapDef['versus']['spawns'];
}
export interface VersusGenOpts {
  nMin?: number;
  topology?: VersusTopology;
}

/** The versus map of a seed for `nMax` total players (`opts.nMin`..`nMax` is the range every candidate is validated for). */
export function generateVersus(
  seed: number,
  diff: Difficulty,
  nMax: number,
  maxAttempts = MAX_ATTEMPTS,
  opts: VersusGenOpts = {},
): GeneratedVersus {
  const hi = Math.max(2, Math.min(8, Math.floor(nMax) || 2)),
    lo = Math.max(2, Math.min(hi, Math.floor(opts.nMin ?? hi)));
  const team = teamRange(lo, hi);
  const mech = pickMech(seed, team.max);
  const rng = mulberry32(seed);
  const topology: VersusTopology = opts.topology ?? (rng() < 0.65 ? 'side' : 'stack');
  const sigma = VERSUS_TOPOLOGIES[topology];
  for (let i = 1; i <= maxAttempts; i++) {
    const arch = pickWeighted(rng, HALF_WEIGHTS[diff]);
    const layout = halfLayout(topology);
    applyHalfArchetype(arch, topology, layout.cells, rng);
    scatterObstacles(layout.cells, OBSTACLES[diff], rng, HALF_BOUNDS[topology]);
    const claimed = placeStations(layout, team.max, diff, rng, mech);
    if (!claimed || !placeSpawns(layout, team.max, claimed, rng)) continue;
    const half = rowsOf(layout.cells);
    const halfGrid = parseMap(half);
    const ordered = orderSpawns(half, spawnTiles(halfGrid), team.max, mech);
    const rows = composeVersus(half, topology);
    const def: VersusMapDef = {
      id: 'gen',
      name: 'gen',
      rows,
      nMin: lo,
      nMax: hi,
      minDuro: lo,
      stars: 2,
      versus: { sigma, spawns: [ordered, ordered.map(([x, y]) => SIGMAS[sigma](x, y, MAP_W, MAP_H))] },
    };
    if (!validateVersus(def).ok) continue;
    return {
      rows,
      topology,
      sigma,
      archetype: arch,
      d: metric(halfGrid, team.max).D,
      attempts: i,
      fallback: false,
      nMin: lo,
      nMax: hi,
      mech,
      spawns: def.versus.spawns,
    };
  }
  const fb = VERSUS_BASE_MAPS.find((m) => m.versus.sigma === sigma && m.nMin <= lo && m.nMax >= hi) ?? VERSUS_BASE_MAPS[0]!;
  return {
    rows: [...fb.rows],
    topology: fb.versus.sigma === 'mirrorX' ? 'side' : 'stack',
    sigma: fb.versus.sigma,
    archetype: 'fixed',
    d: metric(parseMap(fb.rows, true), team.max).D,
    attempts: maxAttempts,
    fallback: true,
    nMin: fb.nMin,
    nMax: fb.nMax,
    mech: { cheese: fb.rows.some((r) => r.includes('3')), sink: false },
    spawns: fb.versus.spawns,
  };
}
