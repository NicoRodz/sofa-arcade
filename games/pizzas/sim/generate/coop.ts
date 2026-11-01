// Seeded kitchen generator: topology + loose obstacles + station slots + spawns, retried until it validates and lands in
// the difficulty band. Same seed, difficulty, team size (and range) give the same map. It builds for a range of team sizes
// [nMin, nMax]: spawns and stations are sized for nMax and every N of the range is checked (puestos reachable, floor per chef).
// Topologies (design: abierta, islas, carriles, zonas2 or zonas3) map to open, island, lanes and river/corridor (zonas2);
// zonas3 (three rooms) is not generated: the fixed maps 13 and 15 cover it.
import {
  MAX_ATTEMPTS,
  OBSTACLES,
  WEIGHTS,
  applyArchetype,
  bandDist,
  inBand,
  placeStations,
  rowsOf,
  scatterObstacles,
  type Archetype,
  type Mech,
  type Zone,
} from './layout';
import { MAPS_BY_DIFFICULTY, fixedMap, parseMap, recommendedMaps, type MapDef, type Pos } from '../maps';
import type { PuestoId } from '../phone/puestos';
import { mulberry32, pickWeighted, teamSize, type Difficulty } from '@pichi/core';
import { orderSpawns, placeSpawns, zonePuestos } from './spawns';
import { FLOOR_PER_PLAYER, floorTiles, minPlayers, spawnTiles, validateMap, zoneShareProblems } from '../validate';
import { metric } from '../scoring/score';

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
