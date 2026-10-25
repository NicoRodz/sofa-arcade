import { MAP_H, MAP_W, parseMap, type SigmaName, type VersusMapDef } from '../maps';
import type { Difficulty } from '@pichi/core/difficulty';
import {
  MAX_ATTEMPTS,
  OBSTACLES,
  placeStations,
  rowsOf,
  scatterObstacles,
  type Bounds,
  type Cells,
  type Layout,
  type Mech,
} from './layout';
import { mulberry32, pickWeighted, randInt, type Rng } from '@pichi/core/rng';
import { SIGMAS } from '../symmetry';
import { spawnTiles, teamRange, validateVersus } from '../validate';
import { pickMech } from './coop';
import { orderSpawns, placeSpawns } from './spawns';
import { metric } from '../score';
import { VERSUS_BASE_MAPS } from '../versus/maps';

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
