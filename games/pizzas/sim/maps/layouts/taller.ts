import type { MapDef } from '../types';

// The Taller series (ids 29-36): eight curated maps, one per new mechanic (the last one mixes three), made to be tried by hand. Plain recipes (no card), coop only,
// at most three mechanics each, and every one is playable with two chefs.
const NOTE = { grade: 'C', s: 0.5, sigma: 'mirrorY', why: 'Serie Taller: solo coop.' } as const;

// The dough is kneaded on M, set in the wall: two chefs hold the handles on both sides of it (one is not enough).
export const MAP_29: MapDef = {
  id: '29',
  name: 'Masa de muro',
  nMin: 3,
  nMax: 8,
  minDuro: 1,
  stars: 2,
  mechanics: ['kneader'],
  versusFit: NOTE,
  rows: [
    '################',
    '#1.K.....O.O..E#',
    '#2.K.........P.#',
    '#....S.#..S....#',
    '#3.....M......X#',
    '#.....S#.S.....#',
    '#..K.........P.#',
    '#.S..S.....S.S.#',
    '################',
  ],
};

// The ovens are in a cellar behind two doors that open while somebody stands on the plate Z (next to the K, so the porter chops meanwhile); the wood oven W is quick but its bellows Q is across the river,
// and the fragile bridge is the shortcut: the long way is out one door and in through the other.
export const MAP_30: MapDef = {
  id: '30',
  name: 'Sótano de leña',
  nMin: 3,
  nMax: 6,
  minDuro: 1,
  stars: 3,
  mechanics: ['gate', 'woodOven', 'bridge'],
  versusFit: NOTE,
  rows: [
    '################',
    '#1.2..K....P..E#',
    '#3.......S.....#',
    '#4..S..ZK..S.S.#',
    '#5...S...S..X..#',
    '###D#########D##',
    '#......b.O.....#',
    '#W.....~......Q#',
    '################',
  ],
};

// A river with two ways over: a raft that ferries back and forth, and a fragile bridge that breaks if it is used too much.
export const MAP_31: MapDef = {
  id: '31',
  name: 'Río con balsa',
  nMin: 3,
  nMax: 8,
  minDuro: 1,
  stars: 3,
  mechanics: ['raft', 'bridge'],
  versusFit: NOTE,
  rows: [
    '################',
    '#1.2..bbbbb.O.E#',
    '#S.S.K~~~~~....#',
    '#.....~~~~~.O.P#',
    '#S.K..~=~~~.S..#',
    '#.....~~~~~....#',
    '#S.S..~~~~~.S.S#',
    '#.............X#',
    '################',
  ],
};

// A belt in two opposite lanes that swaps senses every so often, and ovens that cool down when they are used one after the other: three of them, so one rests while the others work.
export const MAP_32: MapDef = {
  id: '32',
  name: 'Cinta que gira',
  nMin: 2,
  nMax: 8,
  minDuro: 1,
  stars: 2,
  mechanics: ['beltReverse', 'ovenHeat'],
  versusFit: NOTE,
  rows: [
    '################',
    '#1.2.K.K.K.P..E#',
    '#S..S......S..S#',
    '#.→→→→→→→→→→→→.#',
    '#.←←←←←←←←←←←←.#',
    '#S...S....S...S#',
    '#O.....O.....O.#',
    '#..............#',
    '################',
  ],
};

// A wall with two one-tile gaps: the first goes east only (>), the second west only (<). The pizza goes over to the ovens by one and the chefs come back for more by the other.
export const MAP_33: MapDef = {
  id: '33',
  name: 'Vaivén',
  nMin: 2,
  nMax: 6,
  minDuro: 1,
  stars: 2,
  mechanics: ['oneWay'],
  versusFit: NOTE,
  rows: [
    '################',
    '#1.2.K..#.O.O.E#',
    '#S..S...#......#',
    '#.......>.....X#',
    '#S..K...#...S..#',
    '#.......<.....P#',
    '#S..S...#...S..#',
    '#...K...#...S..#',
    '################',
  ],
};

// Oil puddles and drips on the way, a sprinkler by the ovens, and a sauce pot: a fire is put out by the sprinkler, but the floor it leaves is as slippery.
export const MAP_34: MapDef = {
  id: '34',
  name: 'Cocina resbalosa',
  nMin: 2,
  nMax: 7,
  minDuro: 1,
  stars: 2,
  mechanics: ['oil', 'sprinkler'],
  versusFit: NOTE,
  rows: [
    '################',
    '#1.2.K.K...P..E#',
    '#S..S...a......#',
    '#........g.....#',
    '#.....O.*..O...#',
    '#S..S.R.....S.S#',
    '#...K..a..g....#',
    '#S.....*.....S.#',
    '################',
  ],
};

// A move: after a minute the oven goes across the kitchen, the board and the plates trade places and the window drops to the bottom corner. Every flow changes and nothing reverts.
export const MAP_35: MapDef = {
  id: '35',
  name: 'Mudanza',
  nMin: 2,
  nMax: 8,
  minDuro: 1,
  stars: 3,
  mechanics: ['mutation'],
  mutation: {
    at: 3600,
    warn: 180,
    revertAt: null,
    ops: [
      ['move', [2, 4], [13, 5]],
      ['swap', [5, 1], [11, 1]],
      ['move', [14, 1], [14, 7]],
    ],
  },
  versusFit: NOTE,
  rows: [
    '################',
    '#1.2.K.K...P..E#',
    '#S..S..........#',
    '#..............#',
    '#.O..........X.#',
    '#S..S..........#',
    '#.....S...S....#',
    '#S...........S.#',
    '################',
  ],
};

// The workshop's last one: the kneader (it takes two) in the wall, oil on the way to its handles and an oven that cools.
export const MAP_36: MapDef = {
  id: '36',
  name: 'Taller final',
  nMin: 3,
  nMax: 8,
  minDuro: 1,
  stars: 3,
  mechanics: ['kneader', 'oil', 'ovenHeat'],
  versusFit: NOTE,
  rows: [
    '################',
    '#1.K...#.O.O..E#',
    '#2.K.........P.#',
    '#....S.#.S.....#',
    '#3...a.M....g.X#',
    '#.....S#.S.....#',
    '#..Ka......O.P.#',
    '#.S..S.....S.S.#',
    '################',
  ],
};

export const TALLER_MAPS: readonly MapDef[] = [MAP_29, MAP_30, MAP_31, MAP_32, MAP_33, MAP_34, MAP_35, MAP_36];
