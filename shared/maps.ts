// Kitchen maps: 16x9 tile grids as strings, plus the parser to typed tiles.
import type { Difficulty } from './difficulty';
import type { PuestoId } from './puestos';

export const MAP_W = 16;
export const MAP_H = 9;

// # wall, . floor, S spawn (floor), ~ water, C counter, 1/2 ingredient crates, K board (stretch/cut),
// O oven, P tray pile, E delivery counter, X trash, 3 cheese crate (Margarita), U dirty-plate return, L sink.
// Design legend (15-mapas.md) -> this code: T->C, M->1, R->2, Q->3, C (table)->K, H->O; the rest is the same.
export type StationKind = 'crate' | 'board' | 'pot' | 'plates' | 'window' | 'counter' | 'trash' | 'dirty' | 'sink';
export type Tile =
  | { kind: 'wall' }
  | { kind: 'floor'; spawn: boolean }
  | { kind: 'water' }
  | { kind: 'station'; station: StationKind; crate: number };
export type Grid = Tile[][];

const STATIONS: Record<string, { station: StationKind; crate: number }> = {
  '1': { station: 'crate', crate: 0 },
  '2': { station: 'crate', crate: 1 },
  '3': { station: 'crate', crate: 2 },
  K: { station: 'board', crate: 0 },
  O: { station: 'pot', crate: 0 },
  P: { station: 'plates', crate: 0 },
  E: { station: 'window', crate: 0 },
  C: { station: 'counter', crate: 0 },
  X: { station: 'trash', crate: 0 },
  U: { station: 'dirty', crate: 0 },
  L: { station: 'sink', crate: 0 },
};
export const STATION_CHAR: Record<string, string> = { crate0: '1', crate1: '2', crate2: '3', board: 'K', pot: 'O', plates: 'P', window: 'E', counter: 'C', trash: 'X', dirty: 'U', sink: 'L' };

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
export function spawnPoints(g: Grid, count: number, order?: readonly Pos[]): [number, number][] {
  const { comp } = floorComponents(g);
  const groups = new Map<number, [number, number][]>();
  g.forEach((row, y) => row.forEach((t, x) => {
    if (t.kind === 'floor' && t.spawn) groups.set(comp[y]![x]!, [...(groups.get(comp[y]![x]!) ?? []), [x, y]]);
  }));
  const lists = [...groups.entries()].sort((p, q) => p[0] - q[0]).map(([, l]) => l);
  let base: [number, number][] = [];
  for (let i = 0; base.length < lists.reduce((n, l) => n + l.length, 0); i++) for (const l of lists) if (l[i]) base.push(l[i]!);
  if (order) base = order.filter(([x, y]) => g[y]?.[x]?.kind === 'floor').map(([x, y]): [number, number] => [x, y]);
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
  nMin: number; // recommended team size range (a validator test pins nMax <= number of S)
  nMax: number;
  minDuro: number; // fewest players that can still finish the recipe (a test derives it from the floor regions)
  stars: 1 | 2 | 3; // the map's own complexity, independent of the Fácil/Normal/Difícil selector
  spawns?: readonly Pos[]; // explicit spawn order when reading order is not the order the author wants
  puestos?: readonly (readonly PuestoId[])[]; // replaces the default puesto table (zone maps), indexed by spawn
}

// Spawns: the 'S' tiles are the spawn slots; slot i goes to the i-th chef (see puestos: spawn i sits next to puesto i).
// minDuro is derived (validate.minPlayers): the river maps 3 and 5 need one player per bank (the design guessed 1 for map 5).
// Map 5 is drawn with the conveyor belt (design section 2) in the design doc; the belt is not implemented,
// so this uses the documented fallback: the belt becomes a second passing counter at (7, 2).
export const FIXED_MAPS: readonly MapDef[] = [
  {
    id: '1', name: 'Cocina abierta', nMin: 2, nMax: 4, minDuro: 1, stars: 1,
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
    id: '2', name: 'Isla central', nMin: 2, nMax: 5, minDuro: 1, stars: 1,
    rows: [
      '##CCCKCCKCCCCC##',
      '#..............#',
      '1..............O',
      'C...CCCCCCC....C',
      '2...CCCCCCC....O',
      'C..............C',
      'P..S.S..S.S.S..C',
      '#..............#',
      '##CCCCCCCCCCCE##',
    ],
  },
  {
    id: '3', name: 'El río', nMin: 2, nMax: 4, minDuro: 2, stars: 2,
    puestos: [['prep'], ['horno', 'reparto'], ['prep'], ['horno', 'reparto']], // left bank prepares, right bank bakes and serves
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
    id: '4', name: 'Pasillo', nMin: 2, nMax: 4, minDuro: 1, stars: 2,
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
    id: '5', name: 'Cinta', nMin: 3, nMax: 6, minDuro: 2, stars: 2,
    puestos: [['prep'], ['horno', 'platos'], ['entrega'], ['horno', 'platos'], ['prep'], ['horno', 'platos']], // delivery is on the preparation bank
    rows: [
      '##1C2CK~COCOCP##',
      '#......~.......#',
      'C..S...C...S...C',
      'C......~.......C',
      'E..S...~...S...C',
      'C......~.......C',
      'C..S...C...S...C',
      '#......~.......#',
      '##CCCCC~CCCCCC##',
    ],
  },
  {
    id: '6', name: 'La ventanita', nMin: 2, nMax: 3, minDuro: 2, stars: 1,
    puestos: [['prep'], ['horno', 'reparto'], ['prep']],
    rows: [
      '##12#KK###O##EE#',
      '#......#.......#',
      '#..S...C.......P',
      '#......#.......#',
      'X......C...S...#',
      '#......#.......X',
      '#..S...C.......#',
      '#......#.......#',
      '#CCC############',
    ],
  },
  {
    id: '7', name: 'Food truck', nMin: 2, nMax: 3, minDuro: 1, stars: 2,
    rows: [
      '################',
      '################',
      '##12CKKCCOCPCX##',
      '##S..........S##',
      '##......S.....##',
      '##CCCCOCCEECCC##',
      '################',
      '################',
      '################',
    ],
  },
  {
    id: '8', name: 'Espejo', nMin: 2, nMax: 4, minDuro: 2, stars: 1,
    rows: [
      '#11#KK###KK#22##',
      '#......C......##',
      '#.S....O....S.##',
      'X......C......X#',
      '#......E......##',
      '#......C......##',
      '#.S....O....S.##',
      '#......P......##',
      '#CCC#######CCC##',
    ],
  },
  {
    id: '9', name: 'La trattoria', nMin: 3, nMax: 5, minDuro: 1, stars: 2,
    rows: [
      '##1#2#3####O#O##',
      '#..............#',
      '#.S.....S......#',
      '#..............P',
      'X...CKCKCKC.S..#',
      '#..............E',
      '#.S.....S......E',
      '#..............#',
      '#CCC######CCC#X#',
    ],
  },
  {
    id: '10', name: 'El lavadero', nMin: 4, nMax: 6, minDuro: 1, stars: 2,
    rows: [
      '#1#2#3##KK##OO##',
      '#..............#',
      '#.S...S...S....P',
      'X....CCCCC.....E',
      '#...........S..E',
      '##C#C#.#.......#',
      'U..S...#..S....X',
      'L......#.......#',
      '#L######CCKCC#P#',
    ],
  },
  {
    // Design spawns (2,2) (12,6) (12,2) (2,6) (5,2) (9,6) (9,2) (5,6) put puesto 2 (Corte) far from the tomato and cheese crates:
    // reordered so spawn i is next to the stations of puesto i (Masa, Corte, Horno, Reparto, Apoyo, Queso, Horno 2, Reparto 2).
    id: '11', name: 'Tres carriles', nMin: 4, nMax: 8, minDuro: 1, stars: 2,
    spawns: [[2, 2], [5, 6], [5, 2], [12, 6], [12, 2], [2, 6], [9, 2], [9, 6]],
    rows: [
      '##123##KK##CC#X#',
      '#..............#',
      '#.S..S...S..S..P',
      '#..CCOCC.CCOCC.E',
      'X..............E',
      '#..CCOCC.CCOCC.E',
      '#.S..S...S..S..P',
      '#..............#',
      '##123##KK##CC#X#',
    ],
  },
  {
    // Design order ends (7,6) (3,6) (11,6); (11,6) moves to 7th so "Horno 2" sits under the ovens of bay C.
    id: '12', name: 'Línea de montaje', nMin: 5, nMax: 8, minDuro: 1, stars: 2,
    spawns: [[2, 2], [6, 2], [10, 2], [14, 2], [13, 7], [7, 6], [11, 6], [3, 6]],
    rows: [
      '#11K#23K#OOO#PP#',
      '#...#...#...#..#',
      '#.S.C.S.C.S.C.SE',
      'X...K...K...C..E',
      '#...C...C...C..#',
      '#...#...#...#..#',
      '#..S...S...S...U',
      '#............S.L',
      '#CCC#CCC#CCC#L##',
    ],
  },
  {
    id: '13', name: 'Tres cuartos', nMin: 5, nMax: 8, minDuro: 3, stars: 3,
    spawns: [[2, 2], [8, 2], [13, 2], [4, 2], [4, 4], [8, 4], [2, 4], [13, 5]],
    puestos: [['masa'], ['horno', 'platos'], ['entrega', 'lavado'], ['corte'], ['queso'], ['horno', 'platos'], ['prep'], ['lavado']], // room A prepares (4), B bakes and plates (2), C serves and washes (2)
    rows: [
      '#123KK##CC##EUE#',
      '#.....C....C...#',
      '#.S.S.O.S..#.S.L',
      'X.....C....C...#',
      '#.S.S.O.S..#...L',
      '#.....C....C.S.#',
      '#.....O....#...#',
      '#.....C....C...X',
      '#KKCCC##PPX#####',
    ],
  },
  {
    // Design spawns put the second Horno/Reparto of the 8-chef table far from their stations; they alternate top/bottom lane here
    // in the order of the puesto table: Masa, Corte, Horno, Reparto, Lavado, Queso, Horno 2, Reparto 2.
    id: '14', name: 'Dos brigadas', nMin: 6, nMax: 8, minDuro: 1, stars: 3,
    spawns: [[2, 2], [5, 6], [10, 2], [13, 6], [2, 6], [5, 2], [10, 6], [13, 2]],
    rows: [
      '##123#KK#CC##X##',
      '#..............#',
      '#.S..S....S..S.P',
      'U..............E',
      'L..COCOCCOCOC..E',
      'L..............E',
      '#.S..S....S..S.P',
      '#..............#',
      '##123#KK#CC##X##',
    ],
  },
  {
    id: '15', name: 'El sótano', nMin: 3, nMax: 6, minDuro: 1, stars: 3,
    spawns: [[2, 2], [8, 2], [2, 6], [12, 6], [5, 1], [12, 1]],
    rows: [
      '#1#2#3###K#K##X#',
      '#....S.#....S..#',
      '#.S.....S......#',
      'X......#.......C',
      '###.#C###C#.####',
      '#......#.......E',
      'O.S.........S..E',
      'O......#.......P',
      '#CCC#X######CC##',
    ],
  },
];

// Mechanics a map brings: a cheese crate ('3') makes Margarita orders, a sink ('L') turns on plate washing.
export const mapFeatures = (rows: readonly string[]) => ({ cheese: rows.some((r) => r.includes('3')), sink: rows.some((r) => r.includes('L')) });

export const MAP_IDS = FIXED_MAPS.map((m) => m.id);
export const fixedMap = (id: string): MapDef | undefined => FIXED_MAPS.find((m) => m.id === id);

// Which fixed maps each difficulty draws from.
export const MAPS_BY_DIFFICULTY: Record<Difficulty, readonly string[]> = { easy: ['1', '2'], normal: ['2', '3', '4'], hard: ['4', '5'] };

export const MAP_CHOICES = ['auto', ...MAP_IDS, 'random'] as const;
export type MapChoice = (typeof MAP_CHOICES)[number];
export const DEFAULT_MAP: MapChoice = 'auto';
export const isMapChoice = (v: unknown): v is MapChoice => MAP_CHOICES.includes(v as MapChoice);

// Lobby: with N connected players every map is recommended (nMin <= N <= nMax), warned (minDuro <= N < nMin: playable but
// meant for more) or blocked (N < minDuro or N > nMax). 0 players count as 2 so an empty lobby still shows a sensible list.
export type MapStatus = { state: 'recommended' } | { state: 'warn'; reason: string } | { state: 'blocked'; reason: string };
export const lobbyN = (connected: number) => Math.max(connected, 0) || 2;

export function mapStatus(m: MapDef, n: number): MapStatus {
  if (n > m.nMax) return { state: 'blocked', reason: `hasta ${m.nMax} jugadores` };
  if (n < m.minDuro) return { state: 'blocked', reason: `necesita ${m.minDuro}+ jugadores` };
  if (n < m.nMin) return { state: 'warn', reason: `pensado para ${m.nMin}+` };
  return { state: 'recommended' };
}
const centre = (m: MapDef) => (m.nMin + m.nMax) / 2;
const byFit = (n: number) => (a: MapDef, b: MapDef) => a.stars - b.stars || Math.abs(centre(a) - n) - Math.abs(centre(b) - n) || Number(a.id) - Number(b.id);

// Recommended maps first (fewer stars first, then nearest to the middle of their range), then warned, then blocked.
export function lobbyMaps(n: number, maps: readonly MapDef[] = FIXED_MAPS): { map: MapDef; status: MapStatus }[] {
  const rank = { recommended: 0, warn: 1, blocked: 2 };
  return maps
    .map((map) => ({ map, status: mapStatus(map, n) }))
    .sort((a, b) => rank[a.status.state] - rank[b.status.state] || byFit(n)(a.map, b.map));
}
export const recommendedMaps = (n: number, maps: readonly MapDef[] = FIXED_MAPS) => lobbyMaps(n, maps).filter((x) => x.status.state === 'recommended').map((x) => x.map);

// What the lobby selects by default: the first recommended map not yet played in this session (any recommended one once all were).
export function defaultMap(n: number, played: ReadonlySet<string>, maps: readonly MapDef[] = FIXED_MAPS): MapDef {
  const rec = recommendedMaps(n, maps);
  return rec.find((m) => !played.has(m.id)) ?? rec[0] ?? lobbyMaps(n, maps).find((x) => x.status.state === 'warn')?.map ?? maps[0]!;
}
// The selected map got blocked (someone joined or left): the recommended map with the closest complexity, then closest range.
export function replacementMap(current: MapDef, n: number, maps: readonly MapDef[] = FIXED_MAPS): MapDef {
  const rec = recommendedMaps(n, maps);
  return [...rec].sort((a, b) => Math.abs(a.stars - current.stars) - Math.abs(b.stars - current.stars) || byFit(n)(a, b))[0] ?? defaultMap(n, new Set(), maps);
}

// "auto" (Aleatorio) draws among the maps recommended for N; rand is injected so the logic stays deterministic.
// Without N it falls back to the per-difficulty list.
export function pickFixedMap(choice: MapChoice, d: Difficulty, rand: () => number, n?: number): MapDef {
  if (choice !== 'auto') return fixedMap(choice) ?? fixedMap(MAPS_BY_DIFFICULTY[d][0]!)!;
  const rec = n === undefined ? [] : recommendedMaps(n);
  if (rec.length) return rec[Math.floor(rand() * rec.length)]!;
  const ids = MAPS_BY_DIFFICULTY[d];
  return fixedMap(ids[Math.floor(rand() * ids.length)]!)!;
}
