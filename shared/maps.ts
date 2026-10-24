// Kitchen maps: 16x9 tile grids as strings, plus the parser to typed tiles.
import type { Difficulty } from './difficulty';

export const MAP_W = 16;
export const MAP_H = 9;

// # wall, . floor, S spawn (floor), ~ water, C counter, 1/2 ingredient crates, K board (stretch/cut),
// O oven, P tray pile, E delivery counter
export type StationKind = 'crate' | 'board' | 'pot' | 'plates' | 'window' | 'counter';
export type Tile =
  | { kind: 'wall' }
  | { kind: 'floor'; spawn: boolean }
  | { kind: 'water' }
  | { kind: 'station'; station: StationKind; crate: number };
export type Grid = Tile[][];

const STATIONS: Record<string, { station: StationKind; crate: number }> = {
  '1': { station: 'crate', crate: 0 },
  '2': { station: 'crate', crate: 1 },
  K: { station: 'board', crate: 0 },
  O: { station: 'pot', crate: 0 },
  P: { station: 'plates', crate: 0 },
  E: { station: 'window', crate: 0 },
  C: { station: 'counter', crate: 0 },
};
export const STATION_CHAR: Record<string, string> = { crate0: '1', crate1: '2', board: 'K', pot: 'O', plates: 'P', window: 'E', counter: 'C' };

export function parseTile(c: string): Tile | null {
  if (c === '#') return { kind: 'wall' };
  if (c === '.') return { kind: 'floor', spawn: false };
  if (c === 'S') return { kind: 'floor', spawn: true };
  if (c === '~') return { kind: 'water' };
  const s = STATIONS[c];
  return s ? { kind: 'station', ...s } : null;
}

export function parseMap(rows: readonly string[]): Grid {
  if (rows.length !== MAP_H) throw new Error(`map needs ${MAP_H} rows, got ${rows.length}`);
  return rows.map((row, y) => {
    if (row.length !== MAP_W) throw new Error(`row ${y} needs ${MAP_W} columns, got ${row.length}`);
    return [...row].map((c, x) => {
      const t = parseTile(c);
      if (!t) throw new Error(`unknown tile '${c}' at (${x}, ${y})`);
      return t;
    });
  });
}

export const isFloor = (g: Grid, x: number, y: number) => g[y]?.[x]?.kind === 'floor';
export const isStation = (g: Grid, x: number, y: number) => g[y]?.[x]?.kind === 'station';
export const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;
export type Pos = [number, number];
export const posKey = (x: number, y: number) => `${x},${y}`;

export function floorComponents(g: Grid, skip?: string): { comp: number[][]; count: number } {
  const comp = g.map((row) => row.map(() => -1));
  let count = 0;
  g.forEach((row, y) => row.forEach((_t, x) => {
    if (!isFloor(g, x, y) || comp[y]![x]! >= 0 || posKey(x, y) === skip) return;
    const stack: Pos[] = [[x, y]];
    comp[y]![x] = count;
    while (stack.length) {
      const [cx, cy] = stack.pop()!;
      for (const [dx, dy] of DIRS) {
        const nx = cx + dx, ny = cy + dy;
        if (isFloor(g, nx, ny) && comp[ny]![nx]! < 0 && posKey(nx, ny) !== skip) { comp[ny]![nx] = count; stack.push([nx, ny]); }
      }
    }
    count++;
  }));
  return { comp, count };
}


// One spawn tile per slot: the S tiles in reading order, taking turns between floor regions so split maps get
// players on both sides, then the free floor nearest to a spawn (BFS) for extra players.
export function spawnPoints(g: Grid, count: number): [number, number][] {
  const { comp } = floorComponents(g);
  const groups = new Map<number, [number, number][]>();
  g.forEach((row, y) => row.forEach((t, x) => {
    if (t.kind === 'floor' && t.spawn) groups.set(comp[y]![x]!, [...(groups.get(comp[y]![x]!) ?? []), [x, y]]);
  }));
  const lists = [...groups.entries()].sort((p, q) => p[0] - q[0]).map(([, l]) => l);
  const base: [number, number][] = [];
  for (let i = 0; base.length < lists.reduce((n, l) => n + l.length, 0); i++) for (const l of lists) if (l[i]) base.push(l[i]!);
  if (!base.length) return [];
  const used = new Set(base.map(([x, y]) => `${x},${y}`));
  const out = base.slice(0, count);
  for (let k = base.length; out.length < count; k++) {
    const [sx, sy] = base[k % base.length]!;
    const seen = new Set([`${sx},${sy}`]);
    const queue: [number, number][] = [[sx, sy]];
    let found: [number, number] | null = null;
    for (let i = 0; i < queue.length && !found; i++) {
      const [x, y] = queue[i]!;
      for (const [dx, dy] of DIRS) {
        const nx = x + dx, ny = y + dy, key = `${nx},${ny}`;
        if (seen.has(key) || !isFloor(g, nx, ny)) continue;
        seen.add(key);
        if (!used.has(key)) { found = [nx, ny]; break; }
        queue.push([nx, ny]);
      }
    }
    if (!found) break;
    used.add(`${found[0]},${found[1]}`);
    out.push(found);
  }
  return out;
}

export interface MapDef {
  id: string;
  name: string;
  rows: readonly string[];
}

// Map 5 is drawn with the conveyor belt (design section 2) in the design doc; the belt is not implemented,
// so this uses the documented fallback: the belt becomes a second passing counter at (7, 2).
export const FIXED_MAPS: readonly MapDef[] = [
  {
    id: '1', name: 'Cocina abierta',
    rows: [
      '##C1C2CKCKCOCOC#',
      '#..............#',
      'C..............C',
      'C..............C',
      'P...S.S.S.S....E',
      'C..............C',
      'C..............C',
      '#..............#',
      '##CCCCCCCCCCCC##',
    ],
  },
  {
    id: '2', name: 'Isla central',
    rows: [
      '##CCCKCCKCCCCC##',
      '#..............#',
      '1..............O',
      'C...CCCCCCC....C',
      '2...CCCCCCC....O',
      'C..............C',
      'P..S.S....S.S..C',
      '#..............#',
      '##CCCCCCCCCCCE##',
    ],
  },
  {
    id: '3', name: 'El río',
    rows: [
      '##1C2CK~CCOCOC##',
      '#......~.......#',
      'K......C.......P',
      'C......~.......C',
      'C..S...C...S...E',
      'C......~.......C',
      'C..S...C...S...C',
      '#......~.......#',
      '##CCCCC~CCCCCC##',
    ],
  },
  {
    id: '4', name: 'Pasillo',
    rows: [
      '#1C2CK####COCOC#',
      '#.....####.....#',
      'K.....####.....P',
      'C.....####.....C',
      'E.S..........S.C',
      'C.....####.....C',
      'C.S...####...S.C',
      '#.....####.....#',
      '##CCCC####CCCC##',
    ],
  },
  {
    id: '5', name: 'Cinta',
    rows: [
      '##1C2CK~COCOCP##',
      '#......~.......#',
      'C......C.......C',
      'C......~.......C',
      'E..S...~...S...C',
      'C......~.......C',
      'C..S...C...S...C',
      '#......~.......#',
      '##CCCCC~CCCCCC##',
    ],
  },
];

export const MAP_IDS = FIXED_MAPS.map((m) => m.id);
export const fixedMap = (id: string): MapDef | undefined => FIXED_MAPS.find((m) => m.id === id);

// Which fixed maps each difficulty draws from.
export const MAPS_BY_DIFFICULTY: Record<Difficulty, readonly string[]> = { easy: ['1', '2'], normal: ['2', '3', '4'], hard: ['4', '5'] };

export const MAP_CHOICES = ['auto', ...MAP_IDS, 'random'] as const;
export type MapChoice = (typeof MAP_CHOICES)[number];
export const DEFAULT_MAP: MapChoice = 'auto';
export const isMapChoice = (v: unknown): v is MapChoice => MAP_CHOICES.includes(v as MapChoice);

// "auto" draws one of the maps listed for the difficulty; rand is injected so the logic stays deterministic.
export function pickFixedMap(choice: MapChoice, d: Difficulty, rand: () => number): MapDef {
  if (choice !== 'auto') return fixedMap(choice) ?? fixedMap(MAPS_BY_DIFFICULTY[d][0]!)!;
  const ids = MAPS_BY_DIFFICULTY[d];
  return fixedMap(ids[Math.floor(rand() * ids.length)]!)!;
}
