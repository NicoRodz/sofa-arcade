// Fixture from the design plan (§11, grid A).
// The first four cells of the last wall (cols 50-53, row 8) are '%': solid only in Libres, so the wall is 4 tiles untied (a tower of 2 climbs it)
// and 3 tied, then a one-tile step up to the goal. Tied, the 168 px rope cannot hold a climber 192 px above the base (S2 campaign fix: the
// shipped version could not be finished in Encadenados). Libres is unchanged. The plan's "Geometria" lines are the source of truth if a width test fails.
import type { LevelDef } from '../types';

export const LEVEL_01: LevelDef = {
  id: 'l01', name: 'Primeros pasos', biome: 'beach', players: { min: 2, max: 8 }, tether: 'any', stars: 1, parSec: 75,
  hints: [{ x: 46, y: 9, text: '¡Súbete sobre un compañero!' }],
  rows: [
    '#..........................................................#',
    '#..........................................................#',
    '#..........................................................#',
    '#..........................................................#',
    '#.....................................*....................#',
    '#..........................................................#',
    '#...................................====...................#',
    '#.......................................................G..#',
    '#.................*................P..............%%%%######',
    '#..........................####...########........##########',
    '#..........................####...########...*....##########',
    '#..S...................########...########........##########',
    '#############..################^^^##########################',
    '#############~~#############################################'
  ],
};
