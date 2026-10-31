// The map patches of HAZARD_V3 (design 1.1, tanda 2a): one dynamic per map, as tile edits plus the mechanics (and, for map 22, a v2 mutation), applied to the fixed coop maps the 6-8 chef groups get
// (10, 12, 13, 14, 15, 22, 27). Pure data and one pure function: the same (map, difficulty) always gives the same rows, no stream. A patch is coop only (versus keeps its maps) and the original maps stay
// untouched in `layouts/`, so a round without `hazardV3` plays them as before. `patchMap` returns the map itself when it has no patch.
import type { Difficulty } from '@pichi/core/difficulty';
import type { MechId } from '../mech/ids';
import type { Op } from '../mech/mutation/ops';
import type { MapDef } from './types';

interface Edit {
  at: readonly [number, number];
  to: string; // the new letter
  was: string; // the letter it must have (a test guards the patch against a map that moved)
}
interface Patch {
  edits: readonly Edit[];
  mechanics: readonly MechId[];
  minDuro?: number; // the doors join rooms that stood alone: a lone chef can now cross
  mutation?: { at: number; warn: number; ops: readonly Op[] }; // at 60 s, back at 120 s (two waves); Hard keeps one op more
}

const PATCHES: Readonly<Record<string, Patch>> = {
  // El lavadero: soapy water, a drip from the sink
  '10': { edits: [{ at: [1, 7], to: 'g', was: '.' }], mechanics: ['oil'] },
  // Linea de montaje: two kneaders replace the two boards of the middle bays (the dough goes through M, two chefs per handle pair)
  '12': {
    edits: [
      { at: [4, 3], to: 'M', was: 'K' },
      { at: [8, 3], to: 'M', was: 'K' },
    ],
    mechanics: ['kneader'],
  },
  // Tres cuartos: a door in each doorway between rooms, 3 s apart (HAZARD_V3.gate.offset)
  '13': {
    edits: [
      { at: [6, 3], to: 'D', was: 'C' },
      { at: [11, 3], to: 'D', was: 'C' },
    ],
    mechanics: ['gate'],
    minDuro: 1,
  },
  // Dos brigadas: a drip in the shared aisle: which brigade cleans it?
  '14': { edits: [{ at: [7, 3], to: 'g', was: '.' }], mechanics: ['oil'] },
  // El sotano: a damp basement: a sprinkler and one drip
  '15': {
    edits: [
      { at: [4, 6], to: '*', was: '.' },
      { at: [10, 5], to: 'g', was: '.' },
    ],
    mechanics: ['oil', 'sprinkler'],
  },
  // Dos alas: the wings trade stations at 60 s and trade back at 120 s
  '22': {
    edits: [],
    mechanics: ['mutation'],
    mutation: {
      at: 3600,
      warn: 180,
      ops: [
        ['swap', [0, 2], [15, 7]],
        ['swap', [0, 5], [15, 4]],
        ['swap', [15, 2], [0, 7]],
      ],
    },
  },
  // Isla de hornos: the heat of the ovens
  '27': { edits: [], mechanics: ['ovenHeat'] },
};

export const PATCHED_MAP_IDS: readonly string[] = Object.keys(PATCHES);
export const hasPatch = (id: string): boolean => Object.hasOwn(PATCHES, id);

/** The map with its HAZARD_V3 dynamic; the same object when the map has none. `difficulty`: Hard keeps all the mutation ops of the patch, Normal the first two. */
type Patchable = Pick<MapDef, 'id' | 'rows' | 'mechanics' | 'mutation'>; // what resolveMap hands the screen is a MapDef without the lobby fields
export function patchMap<M extends Patchable>(map: M, difficulty: Difficulty): M {
  if (!hasPatch(map.id) || map.mechanics?.length || map.mutation) return map; // a map that already carries mechanics is never patched
  const p = PATCHES[map.id]!;
  const rows = map.rows.map((r) => [...r]);
  for (const e of p.edits) {
    if (rows[e.at[1]]?.[e.at[0]] !== e.was) throw new Error(`patch of map ${map.id}: tile (${e.at}) is not '${e.was}'`);
    rows[e.at[1]]![e.at[0]] = e.to;
  }
  const ops = p.mutation ? p.mutation.ops.slice(0, difficulty === 'hard' ? 3 : 2) : undefined;
  return {
    ...map,
    rows: rows.map((r) => r.join('')),
    mechanics: p.mechanics,
    ...(p.minDuro !== undefined ? { minDuro: p.minDuro } : {}),
    ...(p.mutation ? { mutation: { at: p.mutation.at, warn: p.mutation.warn, revertAt: p.mutation.at * 2, ops: ops! } } : {}),
  };
}
