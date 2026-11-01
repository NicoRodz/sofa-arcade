// Kitchen layouts: the archetypes, the difficulty bands, the shell with obstacles and the station slots (shared by coop and versus halves).
import { teamSize, type Difficulty, pick, randInt, type Rng } from '@pichi/core';
import type { Features } from '../phone/puestos';
import { MAP_H, MAP_W, parseMap, posKey, type Pos } from '../maps';
import { accessTiles, analyze } from '../validate';

export const ARCHETYPES = ['open', 'island', 'lanes', 'river', 'corridor'] as const;
export type Archetype = (typeof ARCHETYPES)[number];
export const MAX_ATTEMPTS = 200;

export const WEIGHTS: Record<Difficulty, Record<Archetype, number>> = {
  easy: { open: 0.6, island: 0.4, lanes: 0, river: 0, corridor: 0 },
  normal: { open: 0.1, island: 0.25, lanes: 0.15, river: 0.25, corridor: 0.25 },
  hard: { open: 0, island: 0, lanes: 0.2, river: 0.4, corridor: 0.4 },
};
export const OBSTACLES: Record<Difficulty, number> = { easy: 0, normal: 2, hard: 4 };
// D band per difficulty: easy < 50, normal 50..70, hard > 70.
const BAND: Record<Difficulty, [number, number]> = { easy: [-Infinity, 50], normal: [50, 70], hard: [70, Infinity] };
export const inBand = (d: number, diff: Difficulty) => {
  const [lo, hi] = BAND[diff];
  return diff === 'easy' ? d < hi : diff === 'hard' ? d > lo : d >= lo && d <= hi;
};
export const bandDist = (d: number, diff: Difficulty) => (inBand(d, diff) ? 0 : Math.max(BAND[diff][0] - d, d - BAND[diff][1]));

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
export type Zone = 'A' | 'B';
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

export const rowsOf = (cells: Cells) => cells.map((r) => r.join(''));
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
