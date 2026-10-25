// Level 2 "El muelle flojo" (plan §10), authored for the F2b validator (valid in every mode its tether allows, Hard physics).
// Planks (!) are solid for the validator; the sim of F2a collapses them (0.5 s) and brings them back (3 s).
// Boyas (T) are nodes of their own: landing on one launches at 1.45 * v0.
// "Plantarse para sostener" has no entity in the format: it is only a hint.
import type { LevelDef } from '../types';

export const LEVEL_02: LevelDef = {
  id: 'l02', name: 'El muelle flojo', biome: 'beach', players: { min: 2, max: 8 }, tether: 'any', stars: 1, parSec: 70,
  hints: [{ x: 11, y: 8, text: 'Los tablones se derrumban: no te quedes quieto' }],
  rows: [
    '#..........................................................#',
    '#..........................................................#',
    '#..........................................................#',
    '#..........................................................#',
    '#..........................................................#',
    '#............................*.............................#',
    '#..........................................................#',
    '#..........................................................#',
    '#.............*..................................*.........#',
    '#..........................................................#',
    '#..S................P...................................G..#',
    '##########!!!!!!!!######...T...T..############!!!!!!!#######',
    '##########~~~~~~~~######~~~~~~~~~~############~~~~~~~#######',
    '##########~~~~~~~~######~~~~~~~~~~############~~~~~~~#######'
  ],
};
