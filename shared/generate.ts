// Seeded kitchen generator: archetype + loose obstacles + station slots + spawns, retried until it validates
// and lands in the difficulty band. Same seed, difficulty and team size give the same map.
import type { Difficulty } from './difficulty';
import { teamSize } from './difficulty';
import { MAPS_BY_DIFFICULTY, MAP_H, MAP_W, fixedMap, parseMap, pickFixedMap, posKey, type MapChoice, type Pos } from './maps';
import { mulberry32, pick, pickWeighted, randInt, type Rng } from './rng';
import { metric } from './score';
import { accessTiles, analyze, validate } from './validate';

export const ARCHETYPES = ['open', 'island', 'river', 'corridor'] as const;
export type Archetype = (typeof ARCHETYPES)[number];
export const MAX_ATTEMPTS = 200;

const WEIGHTS: Record<Difficulty, Record<Archetype, number>> = {
  easy: { open: 0.6, island: 0.4, river: 0, corridor: 0 },
  normal: { open: 0.1, island: 0.3, river: 0.3, corridor: 0.3 },
  hard: { open: 0, island: 0, river: 0.5, corridor: 0.5 },
};
const OBSTACLES: Record<Difficulty, number> = { easy: 0, normal: 2, hard: 4 };
// D band per difficulty: easy < 50, normal 50..70, hard > 70.
const BAND: Record<Difficulty, [number, number]> = { easy: [-Infinity, 50], normal: [50, 70], hard: [70, Infinity] };
export const inBand = (d: number, diff: Difficulty) => {
  const [lo, hi] = BAND[diff];
  return diff === 'easy' ? d < hi : diff === 'hard' ? d > lo : d >= lo && d <= hi;
};
const bandDist = (d: number, diff: Difficulty) => (inBand(d, diff) ? 0 : Math.max(BAND[diff][0] - d, d - BAND[diff][1]));

export function stationCounts(n: number, diff: Difficulty) {
  const t = teamSize(n);
  const boards = Math.max(1, (t <= 3 ? 2 : t <= 5 ? 3 : 4) - (diff === 'hard' ? 1 : 0));
  return { boards, ovens: t <= 5 ? 2 : 3, crates: t >= 6 ? 2 : 1 };
}

export type Cells = string[][];
type Zone = 'A' | 'B';
export interface Layout { cells: Cells; zoneAt: ((x: number) => Zone) | null; blockX: [number, number] | null }

const shell = (): Cells =>
  Array.from({ length: MAP_H }, (_, y) => Array.from({ length: MAP_W }, (_, x) => {
    if (x > 0 && x < MAP_W - 1 && y > 0 && y < MAP_H - 1) return '.';
    const corner = y === 0 || y === MAP_H - 1 ? x < 2 || x >= MAP_W - 2 : y === 1 || y === MAP_H - 2;
    return corner ? '#' : 'C';
  }));

export function applyArchetype(arch: Archetype, diff: Difficulty, rng: Rng): Layout {
  const cells = shell();
  if (arch === 'island') {
    const w = randInt(rng, 3, 7), h = randInt(rng, 1, 2);
    const x0 = Math.floor((MAP_W - w) / 2) + randInt(rng, -1, 1), y0 = h === 2 ? 3 : 4;
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) cells[y]![x] = 'C';
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
    const len = randInt(rng, 2, 5), a = randInt(rng, 4, 12 - len), gap = randInt(rng, 2, 6);
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

export function scatterObstacles(cells: Cells, count: number, rng: Rng) {
  for (let i = 0; i < count; i++) {
    const before = shape(cells);
    for (let tries = 0; tries < 10; tries++) {
      const x = randInt(rng, 2, MAP_W - 3), y = randInt(rng, 2, MAP_H - 3);
      if (cells[y]![x] !== '.') continue;
      cells[y]![x] = 'C';
      if (shape(cells) === before) break;
      cells[y]![x] = '.';
    }
  }
}

export function placeStations(l: Layout, n: number, diff: Difficulty, rng: Rng): Set<string> | null {
  const { cells, zoneAt } = l;
  const grid = parseMap(rowsOf(cells));
  const passes = new Set(analyze(grid).passes.map((p) => posKey(...p.pos)));
  const claimed = new Set<string>();
  const { boards, ovens, crates } = stationCounts(n, diff);
  const order: [string, Zone][] = [
    ['E', diff === 'hard' ? 'A' : 'B'],
    ...Array<[string, Zone]>(ovens).fill(['O', 'B']),
    ['P', 'B'],
    ...Array<[string, Zone]>(boards).fill(['K', 'A']),
    ...Array<[string, Zone]>(crates).fill(['1', 'A']),
    ...Array<[string, Zone]>(crates).fill(['2', 'A']),
  ];
  for (const [ch, zone] of order) {
    const slots: { at: Pos; acc: Pos }[] = [];
    cells.forEach((row, y) => row.forEach((c, x) => {
      if (c !== 'C' || passes.has(posKey(x, y))) return;
      const acc = accessTiles(parseMap(rowsOf(cells)), x, y).find(([ax, ay]) => !claimed.has(posKey(ax, ay)) && (!zoneAt || zoneAt(ax) === zone));
      if (acc) slots.push({ at: [x, y], acc });
    }));
    if (!slots.length) return null;
    const s = pick(rng, slots);
    cells[s.at[1]]![s.at[0]] = ch;
    claimed.add(posKey(...s.acc));
  }
  return claimed;
}

// Spawns: floor tiles that are nobody's access tile, 2+ apart, alternating zones when the map has them.
function placeSpawns(l: Layout, n: number, claimed: Set<string>, rng: Rng): boolean {
  const { cells, zoneAt, blockX } = l;
  const chosen: Pos[] = [];
  for (let i = 0; i < teamSize(n); i++) {
    const want: Zone | null = zoneAt ? (i % 2 ? 'B' : 'A') : null;
    const cand: Pos[] = [];
    cells.forEach((row, y) => row.forEach((c, x) => {
      if (c !== '.' || claimed.has(posKey(x, y))) return;
      if (blockX && x >= blockX[0] && x < blockX[1]) return;
      if (want && zoneAt!(x) !== want) return;
      if (chosen.every(([cx, cy]) => Math.abs(cx - x) + Math.abs(cy - y) >= 2)) cand.push([x, y]);
    }));
    if (!cand.length) return false;
    const [x, y] = pick(rng, cand);
    cells[y]![x] = 'S';
    chosen.push([x, y]);
  }
  return true;
}

export interface Generated { rows: string[]; archetype: Archetype | 'fixed'; d: number; inBand: boolean; attempts: number }

export function generate(seed: number, diff: Difficulty, n: number, maxAttempts = MAX_ATTEMPTS): Generated {
  const rng = mulberry32(seed);
  let best: Generated | null = null;
  for (let i = 1; i <= maxAttempts; i++) {
    const arch = pickWeighted(rng, WEIGHTS[diff]);
    const layout = applyArchetype(arch, diff, rng);
    scatterObstacles(layout.cells, OBSTACLES[diff], rng);
    const claimed = placeStations(layout, n, diff, rng);
    if (!claimed || !placeSpawns(layout, n, claimed, rng)) continue;
    const grid = parseMap(rowsOf(layout.cells));
    if (!validate(grid).ok) continue;
    const d = metric(grid, n).D;
    const g: Generated = { rows: rowsOf(layout.cells), archetype: arch, d, inBand: inBand(d, diff), attempts: i };
    if (g.inBand) return g;
    if (!best || bandDist(d, diff) < bandDist(best.d, diff)) best = g;
  }
  if (best) return best;
  const fb = fixedMap(MAPS_BY_DIFFICULTY[diff][0]!)!;
  return { rows: [...fb.rows], archetype: 'fixed', d: metric(parseMap(fb.rows), n).D, inBand: false, attempts: maxAttempts };
}

// The map a lobby choice stands for. "random" is generated from the lobby seed; the rest are fixed maps.
export function resolveMap(choice: MapChoice, seed: number, diff: Difficulty, n: number, rand: Rng): { name: string; rows: readonly string[] } {
  if (choice === 'random') return { name: `Aleatorio ${seed}`, rows: generate(seed, diff, n).rows };
  return pickFixedMap(choice, diff, rand);
}
