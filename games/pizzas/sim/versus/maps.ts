// Versus kitchens (design pizzas-modalidades-coop-versus §2): the five new maps V1-V5, the maps derived from coop ones, and the
// tool that derives them. The coop registry (FIXED_MAPS) is untouched: versus maps live here and the lobby picks them by mode.
//
// Legend, reconciled with the real one (maps.ts): the design's M T Q C H letters are 1 2 3 K O here (M dough, T tomato, Q cheese,
// C board, H oven); its '=' counter is C, 'B' trash is X, 'a'/'b' starts are S. The design's '|' barrier tile does not exist: two
// columns (or one row) of plain walls '#' do the same job, and the isolation is checked by validateVersus, not by a tile type.
// Sabotage: each kitchen has a catapult 'Y' (the launcher of the rubbish bags, see sabotage.ts) in place of a counter next to the barrier, twins
// under sigma. It is a legend letter only versus maps have: parseMap(rows, true). The design's 'P' for it was taken (P is the tray pile here).
// Design's 'L' (sink) is dropped from V1 and V3: a sink also needs the dirty-plate return U and turns washing on for the whole
// map, and coop only does that from 5 players (teams here are 1 to 4 chefs). Those tiles became counters.
import {
  FIXED_MAPS,
  MAP_H,
  MAP_W,
  parseMap,
  spawnPoints,
  type HalfName,
  type MapDef,
  type Pos,
  type SigmaName,
  type VersusMapDef,
} from '../maps';
import { SIGMAS } from '../maps/symmetry';

const twin = (sigma: SigmaName, [x, y]: Pos): Pos => SIGMAS[sigma](x, y, MAP_W, MAP_H);
const twins = (sigma: SigmaName, list: readonly Pos[]): Pos[] => list.map((p) => twin(sigma, p));

// Both kitchens' spawn lists: B is sigma of A, index by index (the "mirror test": a script mirrored through sigma plays the same match).
const spawnsFor = (sigma: SigmaName, a: readonly Pos[]): VersusMapDef['versus']['spawns'] => [a, twins(sigma, a)];

export const VERSUS_BASE_MAPS: readonly VersusMapDef[] = [
  {
    // Design V1. Axis between columns 7 and 8; each side holds every station on its walls and four starts.
    id: 'V1',
    name: 'Duelo clásico',
    nMin: 2,
    nMax: 8,
    minDuro: 2,
    stars: 1,
    versus: {
      sigma: 'mirrorX',
      spawns: spawnsFor('mirrorX', [
        [2, 5],
        [2, 6],
        [5, 5],
        [5, 6],
      ]),
    },
    rows: [
      '#123#OO##OO#321#',
      'C......##......C',
      'K......##......K',
      'K..CC..##..CC..K',
      'C..CC..##..CC..C',
      'P.S..S.##.S..S.P',
      'C.S..S.##.S..S.C',
      'X......##......X',
      '#CCECY####YCECC#',
    ],
  },
  {
    // Design V2: V1 without its own cheese crate. The two '3' in the barrier, (7, 4) for the left team and (8, 4) for the right one,
    // are the shared pantry (F5): both crates draw from one stock of 4 units that gets +1 every 6 s (PANTRY_MAX / PANTRY_EVERY_MS in versus.ts).
    id: 'V2',
    name: 'Despensa',
    nMin: 4,
    nMax: 8,
    minDuro: 4,
    stars: 2,
    versus: {
      sigma: 'mirrorX',
      spawns: spawnsFor('mirrorX', [
        [2, 5],
        [5, 5],
        [5, 6],
        [2, 6],
      ]),
      shared: [
        [7, 4],
        [8, 4],
      ],
    },
    rows: [
      '#12C#OO##OO#C21#',
      'C......##......C',
      'K......##......K',
      'K..CC..##..CC..K',
      'C..CC..33..CC..C',
      'P.S..S.##.S..S.P',
      'C.S..S.##.S..S.C',
      'X......##......X',
      '#CCECY####YCECC#',
    ],
  },
  {
    // Design V3: one kitchen above the other, a 14-tile corridor each; sigma is the half turn (x, y) -> (15 - x, 8 - y).
    id: 'V3',
    name: 'Dos pisos',
    nMin: 2,
    nMax: 6,
    minDuro: 2,
    stars: 2,
    versus: {
      sigma: 'rot180',
      spawns: spawnsFor('rot180', [
        [3, 2],
        [7, 2],
        [11, 2],
      ]),
    },
    rows: [
      '#123COOCKKCPCCX#',
      'C..............E',
      'C..S...S...S...C',
      '#CCCCCCCCCCCYCC#',
      '################',
      '#CCYCCCCCCCCCCC#',
      'C...S...S...S..C',
      'E..............C',
      '#XCCPCKKCOOC321#',
    ],
  },
  {
    // V4 (no grid in the design): the ovens are a two-tile island in the middle of each kitchen; boards and plates sit at opposite corners,
    // crates against the barrier, delivery on the outer wall. Its route is 34 steps against V1's 32.
    id: 'V4',
    name: 'Isla doble',
    nMin: 4,
    nMax: 8,
    minDuro: 4,
    stars: 2,
    versus: {
      sigma: 'mirrorX',
      spawns: spawnsFor('mirrorX', [
        [2, 6],
        [4, 6],
        [2, 7],
        [4, 7],
      ]),
    },
    rows: [
      '#CX321####123XC#',
      'C.....C##C.....C',
      'E.....C##C.....E',
      'C.OO..C##C..OO.C',
      'C.....Y##Y.....C',
      'C.....P##P.....C',
      'K.S.S.C##C.S.S.K',
      'K.S.S.C##C.S.S.K',
      '#CCCCC####CCCCC#',
    ],
  },
  {
    // V5 (no grid in the design): compact 5x5 kitchens, side by side but turned half a turn, for 1v1 and 2v2: crates in the top left
    // corner, ovens down the right wall, delivery in the bottom right corner (B has them the other way round).
    id: 'V5',
    name: 'Esquinas',
    nMin: 2,
    nMax: 4,
    minDuro: 2,
    stars: 1,
    versus: {
      sigma: 'rot180',
      spawns: spawnsFor('rot180', [
        [2, 4],
        [4, 4],
      ]),
    },
    rows: [
      '################',
      '#123CK####CCCCC#',
      'K.....O##Y.....C',
      'C.....O##E.....X',
      'C.S.S.P##P.S.S.C',
      'X.....E##O.....C',
      'C.....Y##O.....K',
      '#CCCCC####KC321#',
      '################',
    ],
  },
];

// --- Deriving a versus map from a coop one ------------------------------------------------------------------------------------

/**
 * Keeps one half of a coop map and reflects it: 'left' copies columns 0-6, walls the columns 7-8 and mirrors (sigma mirrorX);
 * 'top' copies rows 0-3, walls row 4 and turns it half a turn (rot180); 'right' and 'bottom' keep the other halves. The coop map
 * is not modified. Whether the result is playable is up to validateVersus (the kept half must hold every station).
 */
export function mirrorize(rows: readonly string[], half: HalfName): { rows: string[]; sigma: SigmaName; kept: (p: Pos) => boolean } {
  const side = half === 'left' || half === 'right';
  const sigma: SigmaName = side ? 'mirrorX' : 'rot180';
  const kept = (([x, y]: Pos) => (half === 'left' ? x <= 6 : half === 'right' ? x >= 9 : half === 'top' ? y <= 3 : y >= 5)) satisfies (
    p: Pos,
  ) => boolean;
  const out = rows.map((r) => [...r]);
  for (let y = 0; y < MAP_H; y++)
    for (let x = 0; x < MAP_W; x++) {
      if (kept([x, y])) continue;
      const [tx, ty] = twin(sigma, [x, y]);
      out[y]![x] = kept([tx, ty]) ? rows[ty]![tx]! : '#'; // the barrier is walls
    }
  return { rows: out.map((r) => r.join('')), sigma, kept };
}

/** `<id>-vs`: the coop map with one half mirrorized. Spawn order is the coop one, restricted to the kept half. */
export function deriveVersus(m: MapDef, half: HalfName): VersusMapDef {
  const { rows, sigma, kept } = mirrorize(m.rows, half);
  const a = spawnPoints(parseMap(m.rows), 8, m.spawns).filter(kept);
  return {
    id: `${m.id}-vs`,
    name: `${m.name} (versus)`,
    rows,
    nMin: 2,
    nMax: Math.max(2, Math.min(8, 2 * a.length)),
    minDuro: 2,
    stars: m.stars,
    versus: { sigma, spawns: spawnsFor(sigma, a) },
  };
}

// --- Registry -----------------------------------------------------------------------------------------------------------------

// Every versus map: the five designed ones plus the `<id>-vs` derived from the coop maps graded B (versusFit in maps.ts).
export const VERSUS_MAPS: readonly VersusMapDef[] = [
  ...VERSUS_BASE_MAPS,
  ...FIXED_MAPS.filter((m) => m.versusFit?.grade === 'B').map((m) => deriveVersus(m, m.versusFit!.half!)),
];
export const VERSUS_MAP_IDS = VERSUS_MAPS.map((m) => m.id);
export const versusMap = (id: string): VersusMapDef | undefined => VERSUS_MAPS.find((m) => m.id === id);
/** Versus maps that accept this many TOTAL players (the lobby filter for the versus mode). */
export const versusMapsFor = (players: number): VersusMapDef[] => VERSUS_MAPS.filter((m) => m.nMin <= players && players <= m.nMax);

// What the lobby can hold in `config.map` in versus mode: one of the maps above, "auto" (one that fits the teams) or "random" (generated from the seed).
// Here, not in the lobby module, so the phones can validate it without loading the sim.
export const VERSUS_AUTO = 'vs-auto';
export const VERSUS_RANDOM = 'vs-random';
export const VERSUS_CHOICES = [VERSUS_AUTO, ...VERSUS_MAP_IDS, VERSUS_RANDOM] as const;
export type VersusChoice = (typeof VERSUS_CHOICES)[number];
export const isVersusChoice = (v: unknown): v is VersusChoice => VERSUS_CHOICES.includes(v as VersusChoice);
