// Kitchen maps: 16x9 tile grids as strings, plus the parser to typed tiles.
import type { Difficulty } from './difficulty';
import type { PuestoId } from './puestos';
import type { SIGMAS } from './symmetry';

export const MAP_W = 16;
export const MAP_H = 9;

// # wall, . floor, S spawn (floor), ~ water, C counter, 1/2 ingredient crates, K board (stretch/cut),
// O oven, P tray pile, E delivery counter, X trash, 3 cheese crate (Margarita), U dirty-plate return, L sink,
// Y catapult (VERSUS maps only, the sabotage launcher: parseMap refuses it unless the caller says the map is a versus one).
// Design legend (15-mapas.md) -> this code: T->C, M->1, R->2, Q->3, C (table)->K, H->O; the rest is the same.
export type StationKind = 'crate' | 'board' | 'pot' | 'plates' | 'window' | 'counter' | 'trash' | 'dirty' | 'sink' | 'catapult';
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
const VERSUS_ONLY: Record<string, { station: StationKind; crate: number }> = { Y: { station: 'catapult', crate: 0 } };
export const STATION_CHAR: Record<string, string> = {
  crate0: '1',
  crate1: '2',
  crate2: '3',
  board: 'K',
  pot: 'O',
  plates: 'P',
  window: 'E',
  counter: 'C',
  trash: 'X',
  dirty: 'U',
  sink: 'L',
  catapult: 'Y',
};

/** `versus`: the tile letters that only exist in versus maps (Y, the catapult) are accepted. A coop map refuses them. */
export function parseTile(c: string, versus = false): Tile | null {
  if (c === '#') return { kind: 'wall' };
  if (c === '.') return { kind: 'floor', spawn: false };
  if (c === 'S') return { kind: 'floor', spawn: true };
  if (c === '~') return { kind: 'water' };
  const s = STATIONS[c] ?? (versus ? VERSUS_ONLY[c] : undefined);
  return s ? { kind: 'station', ...s } : null;
}

export function parseMap(rows: readonly string[], versus = false): Grid {
  if (rows.length !== MAP_H) throw new Error(`map needs ${MAP_H} rows, got ${rows.length}`);
  return rows.map((row, y) => {
    if (row.length !== MAP_W) throw new Error(`row ${y} needs ${MAP_W} columns, got ${row.length}`);
    return [...row].map((c, x) => {
      const t = parseTile(c, versus);
      if (!t) throw new Error(`unknown tile '${c}' at (${x}, ${y})${c in VERSUS_ONLY ? ': only a versus map has it' : ''}`);
      return t;
    });
  });
}

export const isFloor = (g: Grid, x: number, y: number) => g[y]?.[x]?.kind === 'floor';
export const isStation = (g: Grid, x: number, y: number) => g[y]?.[x]?.kind === 'station';
export const DIRS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;
export type Pos = [number, number];
export const posKey = (x: number, y: number) => `${x},${y}`;

export function floorComponents(g: Grid, skip?: string): { comp: number[][]; count: number } {
  const comp = g.map((row) => row.map(() => -1));
  let count = 0;
  g.forEach((row, y) =>
    row.forEach((_t, x) => {
      if (!isFloor(g, x, y) || comp[y]![x]! >= 0 || posKey(x, y) === skip) return;
      const stack: Pos[] = [[x, y]];
      comp[y]![x] = count;
      while (stack.length) {
        const [cx, cy] = stack.pop()!;
        for (const [dx, dy] of DIRS) {
          const nx = cx + dx,
            ny = cy + dy;
          if (isFloor(g, nx, ny) && comp[ny]![nx]! < 0 && posKey(nx, ny) !== skip) {
            comp[ny]![nx] = count;
            stack.push([nx, ny]);
          }
        }
      }
      count++;
    }),
  );
  return { comp, count };
}

// One spawn tile per slot: the S tiles in reading order, taking turns between floor regions so split maps get
// players on both sides, then the free floor nearest to a spawn (BFS) for extra players.
export function spawnPoints(g: Grid, count: number, order?: readonly Pos[]): [number, number][] {
  const { comp } = floorComponents(g);
  const groups = new Map<number, [number, number][]>();
  g.forEach((row, y) =>
    row.forEach((t, x) => {
      if (t.kind === 'floor' && t.spawn) groups.set(comp[y]![x]!, [...(groups.get(comp[y]![x]!) ?? []), [x, y]]);
    }),
  );
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
        const nx = x + dx,
          ny = y + dy,
          key = `${nx},${ny}`;
        if (seen.has(key) || !isFloor(g, nx, ny)) continue;
        seen.add(key);
        if (!used.has(key)) {
          found = [nx, ny];
          break;
        }
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
  versusFit?: VersusFit; // coop maps only: what the versus work (F3) found out about this map
}

// --- Versus ---------------------------------------------------------------------------------------------------------
// Design pizzas-modalidades-coop-versus §2. A versus kitchen is one 16x9 grid in two halves joined by a barrier of plain walls
// ('#': the design's '|' barrier tile does not exist, a wall already does the job). The twin of a tile is sigma(tile).
export type SigmaName = keyof typeof SIGMAS;
export type HalfName = 'left' | 'right' | 'top' | 'bottom'; // which half of a coop map `mirrorize` keeps

// Classification of a coop map for versus: A serves as it is (an isometry keeps every tile type, each half has all stations and the
// floors do not touch), B derives a `<id>-vs` map by mirrorizing one half, C is coop only. `s` is the share of tiles the best
// isometry keeps (0..1); `why` is the one-line reason.
export interface VersusFit {
  grade: 'A' | 'B' | 'C';
  s: number;
  sigma?: SigmaName;
  half?: HalfName;
  derived?: string;
  why: string;
}

export interface VersusMeta {
  sigma: SigmaName; // twin of a tile in the other kitchen: mirrorX (side by side), rot180 (one above the other)
  // Spawn tiles per kitchen in chef order (spawn i sits next to the stations of puesto i); kitchen B is sigma of kitchen A, index by index,
  // so a script mirrored through sigma plays the same match. Kitchen A is the one with the first floor tile in reading order.
  spawns: readonly [readonly Pos[], readonly Pos[]];
  shared?: readonly Pos[]; // stations both teams use (V2's pantry: F5); everything else belongs to the kitchen whose floor it touches
}
// For a versus map nMin..nMax are TOTAL players (2..8), so the lobby filters work as they do for coop maps. Chefs per team:
// floor(nMin / 2) .. ceil(nMax / 2) (see teamRange in validate.ts).
export interface VersusMapDef extends MapDef {
  versus: VersusMeta;
}

// Spawns: the 'S' tiles are the spawn slots; slot i goes to the i-th chef (see puestos: spawn i sits next to puesto i).
// minDuro is derived (validate.minPlayers): the river maps 3 and 5 need one player per bank (the design guessed 1 for map 5).
// Map 5 is drawn with the conveyor belt (design section 2) in the design doc; the belt is not implemented,
// so this uses the documented fallback: the belt becomes a second passing counter at (7, 2).
export const FIXED_MAPS: readonly MapDef[] = [
  {
    id: '1',
    name: 'Cocina abierta',
    nMin: 2,
    nMax: 4,
    minDuro: 1,
    stars: 1,
    versusFit: {
      grade: 'C',
      s: 0.9,
      sigma: 'mirrorY',
      why: 'Todas las estaciones corren por el muro superior y los extremos: la mitad izquierda no tiene tabla, horno ni entrega, la superior no tiene platos ni entrega (están en la fila central).',
    },
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
    id: '2',
    name: 'Isla central',
    nMin: 2,
    nMax: 5,
    minDuro: 1,
    stars: 1,
    versusFit: {
      grade: 'C',
      s: 0.88,
      sigma: 'mirrorX',
      why: 'Tomate, hornos y entrega están en la columna o fila central; ninguna mitad tiene las seis estaciones.',
    },
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
    id: '3',
    name: 'El río',
    nMin: 2,
    nMax: 4,
    minDuro: 2,
    stars: 2,
    versusFit: {
      grade: 'C',
      s: 0.88,
      sigma: 'mirrorY',
      why: 'Río cooperativo por diseño: una orilla prepara (masa, tomate, tabla) y la otra hornea y entrega; cada mitad es la mitad de la receta.',
    },
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
    id: '4',
    name: 'Pasillo',
    nMin: 2,
    nMax: 4,
    minDuro: 1,
    stars: 2,
    versusFit: {
      grade: 'C',
      s: 0.9,
      sigma: 'mirrorX',
      why: 'Dos orillas unidas por un pasillo: masa y tabla a la izquierda, hornos y platos a la derecha; la entrega queda en la fila central.',
    },
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
    id: '5',
    name: 'Cinta',
    nMin: 3,
    nMax: 6,
    minDuro: 2,
    stars: 2,
    versusFit: {
      grade: 'C',
      s: 0.92,
      sigma: 'mirrorY',
      why: 'Río con cinta: preparación en una orilla, horno en la otra, y el pase central es la mitad del flujo.',
    },
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
    id: '6',
    name: 'La ventanita',
    nMin: 2,
    nMax: 3,
    minDuro: 2,
    stars: 1,
    versusFit: {
      grade: 'C',
      s: 0.86,
      sigma: 'mirrorY',
      why: 'La mitad superior sí trae las seis estaciones, pero cada equipo necesitaría un chef por orilla (2 como mínimo) y la orilla derecha no tiene inicio en esa mitad.',
    },
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
    id: '7',
    name: 'Food truck',
    nMin: 2,
    nMax: 3,
    minDuro: 1,
    stars: 2,
    versusFit: {
      grade: 'C',
      s: 0.89,
      sigma: 'mirrorX',
      why: 'Una sola cocina de dos filas entre dos muros de estaciones: ni la mitad superior (sin entrega, que está en el muro inferior) ni la inferior (sin masa ni tomate) tienen la receta completa.',
    },
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
    id: '8',
    name: 'Espejo',
    nMin: 2,
    nMax: 4,
    minDuro: 2,
    stars: 1,
    versusFit: {
      grade: 'C',
      s: 0.82,
      sigma: 'mirrorY',
      why: 'No es espejo aprovechable: la izquierda tiene masa y la derecha tomate, y hornos, entrega y platos están en la columna central que usan ambos lados. La versión versus de Espejo es V1.',
    },
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
    id: '9',
    name: 'La trattoria',
    nMin: 3,
    nMax: 5,
    minDuro: 1,
    stars: 2,
    versusFit: {
      grade: 'C',
      s: 0.83,
      sigma: 'mirrorY',
      why: 'Ingredientes a la izquierda, hornos a la derecha, tablas en la fila central.',
    },
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
    id: '10',
    name: 'El lavadero',
    nMin: 4,
    nMax: 6,
    minDuro: 1,
    stars: 2,
    versusFit: {
      grade: 'C',
      s: 0.6,
      sigma: 'mirrorY',
      why: 'Lavado abajo, resto arriba y la entrega en el borde derecho: asimétrico, sin mitad completa.',
    },
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
    id: '11',
    name: 'Tres carriles',
    nMin: 4,
    nMax: 8,
    minDuro: 1,
    stars: 2,
    versusFit: {
      grade: 'B',
      s: 1.0,
      sigma: 'mirrorY',
      half: 'top',
      derived: '11-vs',
      why: 'Simétrica arriba/abajo salvo la fila central, que une las cocinas; la mitad superior (filas 0-3) trae las seis estaciones, queso incluido, y cuatro inicios: sale `11-vs` con muro en la fila 4 y giro de 180°.',
    },
    spawns: [
      [2, 2],
      [5, 6],
      [5, 2],
      [12, 6],
      [12, 2],
      [2, 6],
      [9, 2],
      [9, 6],
    ],
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
    id: '12',
    name: 'Línea de montaje',
    nMin: 5,
    nMax: 8,
    minDuro: 1,
    stars: 2,
    versusFit: {
      grade: 'C',
      s: 0.56,
      sigma: 'mirrorY',
      why: 'Cuatro bahías en serie: una mitad no alcanza a cerrar la receta con menos de 4 chefs por equipo.',
    },
    spawns: [
      [2, 2],
      [6, 2],
      [10, 2],
      [14, 2],
      [13, 7],
      [7, 6],
      [11, 6],
      [3, 6],
    ],
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
    id: '13',
    name: 'Tres cuartos',
    nMin: 5,
    nMax: 8,
    minDuro: 3,
    stars: 3,
    versusFit: {
      grade: 'C',
      s: 0.74,
      sigma: 'mirrorY',
      why: 'Tres salas con funciones repartidas (preparar, hornear, servir y lavar): la mitad superior solo carece de platos (están en la fila 8) y aun con ellos cada equipo necesitaría 3 chefs (minDuro 3).',
    },
    spawns: [
      [2, 2],
      [8, 2],
      [13, 2],
      [4, 2],
      [4, 4],
      [8, 4],
      [2, 4],
      [13, 5],
    ],
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
    id: '14',
    name: 'Dos brigadas',
    nMin: 6,
    nMax: 8,
    minDuro: 1,
    stars: 3,
    versusFit: {
      grade: 'C',
      s: 0.99,
      sigma: 'mirrorY',
      why: 'Casi simétrica arriba/abajo, pero hornos, lavaplatos y entrega están en la fila central que comparten; sin ellos cada mitad no hornea.',
    },
    spawns: [
      [2, 2],
      [5, 6],
      [10, 2],
      [13, 6],
      [2, 6],
      [5, 2],
      [10, 6],
      [13, 2],
    ],
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
    id: '15',
    name: 'El sótano',
    nMin: 3,
    nMax: 6,
    minDuro: 1,
    stars: 3,
    versusFit: {
      grade: 'C',
      s: 0.74,
      sigma: 'mirrorY',
      why: 'Tres salas en cadena (preparar, hornear, entregar): ninguna mitad tiene la receta.',
    },
    spawns: [
      [2, 2],
      [8, 2],
      [2, 6],
      [12, 6],
      [5, 1],
      [12, 1],
    ],
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
export const mapFeatures = (rows: readonly string[]) => ({
  cheese: rows.some((r) => r.includes('3')),
  sink: rows.some((r) => r.includes('L')),
});

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
const byFit = (n: number) => (a: MapDef, b: MapDef) =>
  a.stars - b.stars || Math.abs(centre(a) - n) - Math.abs(centre(b) - n) || Number(a.id) - Number(b.id);

// Recommended maps first (fewer stars first, then nearest to the middle of their range), then warned, then blocked.
export function lobbyMaps(n: number, maps: readonly MapDef[] = FIXED_MAPS): { map: MapDef; status: MapStatus }[] {
  const rank = { recommended: 0, warn: 1, blocked: 2 };
  return maps
    .map((map) => ({ map, status: mapStatus(map, n) }))
    .sort((a, b) => rank[a.status.state] - rank[b.status.state] || byFit(n)(a.map, b.map));
}
export const recommendedMaps = (n: number, maps: readonly MapDef[] = FIXED_MAPS) =>
  lobbyMaps(n, maps)
    .filter((x) => x.status.state === 'recommended')
    .map((x) => x.map);

// What the lobby selects by default: the first recommended map not yet played in this session (any recommended one once all were).
export function defaultMap(n: number, played: ReadonlySet<string>, maps: readonly MapDef[] = FIXED_MAPS): MapDef {
  const rec = recommendedMaps(n, maps);
  return rec.find((m) => !played.has(m.id)) ?? rec[0] ?? lobbyMaps(n, maps).find((x) => x.status.state === 'warn')?.map ?? maps[0]!;
}
// The selected map got blocked (someone joined or left): the recommended map with the closest complexity, then closest range.
export function replacementMap(current: MapDef, n: number, maps: readonly MapDef[] = FIXED_MAPS): MapDef {
  const rec = recommendedMaps(n, maps);
  return (
    [...rec].sort((a, b) => Math.abs(a.stars - current.stars) - Math.abs(b.stars - current.stars) || byFit(n)(a, b))[0] ??
    defaultMap(n, new Set(), maps)
  );
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
