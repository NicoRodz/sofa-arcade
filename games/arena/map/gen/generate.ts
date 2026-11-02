// The seeded map generator: the left half and the centre column are drawn, the right half is their mirror image, the result is validated (V1-V7) and, if it
// fails, the next attempt (`attempt k` of the substream) is tried, up to 64 times. After that the F0 hand-made map stands in. Same seed, same map: bit for bit.
import { mulberry32, type Rng } from '@pichi/core';
import { MAP_H, MAP_W } from '../layout';
import { emptyMap, f0Map, mirrorTile, type Tile, type TileMap } from '../tile-map';
import { furnish } from './furniture';
import { placeLiving } from './living-place';
import type { LivingSpec } from './living-shapes';
import { MAP_SEED_TAG } from './seed';
import { isValidMap } from './validate';
import { v1Connection } from './validate-state';

export const MAX_ATTEMPTS = 64;
const EXIT_ROWS = [1, 5, 9, 13]; // the 4 exits of a team, in column 1; each moves up to 1 row with the seed
const EXIT_COLUMN = 1;
const EXIT_RADIUS = 2; // Manhattan radius kept free around each exit
const TARGET_LOW = 0.19; // furniture share aimed at (the validator accepts 18-24 %)
const TARGET_SPAN = 0.02;
const MAX_JOGS = 2; // vertical steps of a lane
const CENTRE = (MAP_W - 1) / 2;
const TRIES = 600;

export interface GeneratedMap {
  map: TileMap;
  seed: number;
  attempts: number; // 1..64 when generated; 64 plus the fallback when none validated
  fallback: boolean; // the F0 map stands in
  living: LivingSpec[]; // F5: the pairs and the fountain placed on it (empty unless asked for, and on the fallback)
}

/** The random stream of attempt k of a seed: its own substream, so a retry shares nothing with the attempt before. */
export function attemptRng(seed: number, k: number): Rng {
  const rng = mulberry32((Math.imul(seed ^ MAP_SEED_TAG, 0x9e3779b1) ^ Math.imul(k + 1, 0x85ebca6b)) >>> 0);
  rng(); // the first draws of two close seeds are alike: drop one
  return rng;
}

/** The lane of an exit: a staircase of floor from its tile to the centre column with at most 2 jogs, so every walk to the centre is 12 to 14 steps (V4 by construction). */
function lane(rng: Rng, [ex, ey]: Tile): Tile[] {
  const jogs = new Set<number>();
  for (let n = Math.floor(rng() * (MAX_JOGS + 1)); jogs.size < n; )
    jogs.add(EXIT_COLUMN + 2 + Math.floor(rng() * (CENTRE - EXIT_COLUMN - 3)));
  const cells: Tile[] = [];
  let y = ey;
  for (let x = ex; x <= CENTRE; x++) {
    cells.push([x, y]);
    if (jogs.has(x)) {
      const next = y + (rng() < 0.5 ? -1 : 1);
      y = next < 0 || next >= MAP_H ? y - (next - y) : next;
      cells.push([x, y]);
    }
  }
  return cells;
}

/** One attempt, not yet validated. */
export function draw(rng: Rng): TileMap {
  const exits: Tile[] = EXIT_ROWS.map((r) => [EXIT_COLUMN, Math.min(MAP_H - 1, Math.max(0, r + Math.floor(rng() * 3) - 1))]);
  const m = emptyMap([exits, exits.map(mirrorTile)]);
  const keep = new Uint8Array(MAP_W * MAP_H);
  for (const [ex, ey] of exits) {
    for (let y = ey - EXIT_RADIUS; y <= ey + EXIT_RADIUS; y++)
      for (let x = ex - EXIT_RADIUS; x <= ex + EXIT_RADIUS; x++)
        if (x >= 0 && y >= 0 && y < MAP_H && Math.abs(x - ex) + Math.abs(y - ey) <= EXIT_RADIUS) keep[y * MAP_W + x] = 1;
    for (const [x, y] of lane(rng, [ex, ey])) keep[y * MAP_W + x] = 1;
  }
  // Bands: the half split by the nearest exit's row. Each takes the same floor, so the regions V5 compares come out even.
  const band = new Int8Array(MAP_W * MAP_H).fill(-1);
  const cells = exits.map(() => 0);
  for (let y = 0; y < MAP_H; y++)
    for (let x = 0; x < CENTRE; x++) {
      let best = 0;
      exits.forEach(([, ey], k) => (Math.abs(y - ey) < Math.abs(y - exits[best]![1]) ? (best = k) : 0));
      band[y * MAP_W + x] = best;
      cells[best]!++;
    }
  const share = (MAP_W * MAP_H * (TARGET_LOW + rng() * TARGET_SPAN)) / 2 / exits.length; // furniture tiles per band
  const floor = (CENTRE * MAP_H) / exits.length - share;
  const quota = cells.map((c) => Math.max(0, Math.round(c - floor)));
  furnish({ solid: m.solid, keep, band, quota, w: MAP_W, h: MAP_H }, rng, () => v1Connection(m) === null, TRIES);
  return m;
}

/** `accept` is the validator of the base map (injectable so a test can force the fallback); it defaults to V1-V7. With `withLiving` the living map is placed on a valid map (F5). */
export function generateMap(seed: number, accept: (m: TileMap) => boolean = isValidMap, withLiving = false): GeneratedMap {
  for (let k = 0; k < MAX_ATTEMPTS; k++) {
    const rng = attemptRng(seed, k);
    const map = draw(rng);
    if (accept(map)) return { map, seed, attempts: k + 1, fallback: false, living: withLiving ? placeLiving(map, rng) : [] };
  }
  return { map: f0Map(), seed, attempts: MAX_ATTEMPTS, fallback: true, living: [] };
}
