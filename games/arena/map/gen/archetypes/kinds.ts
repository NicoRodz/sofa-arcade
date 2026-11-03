// The four map archetypes. The map seed picks one (`archetypeOf`), each has its own generation rules and signature (V8), and every one is mirrored left-right.
// 'clasico' is what a seed gets when its archetype does not validate in 64 attempts: the generator of F2 (evenly spread furniture), kept as the fallback.
import { mulberry32, type Rng } from '@pichi/core';
import type { Tile } from '../../tile-map';

export const ARCHETYPES = ['pasillos', 'islas', 'plaza', 'ocho'] as const;
export type Archetype = (typeof ARCHETYPES)[number];
export type MapKind = Archetype | 'clasico';

export const ARCHETYPE_SEED_TAG = 0x41524348; // substream `map.archetype` of the map seed

/** What the TV calls it ("¡ISLAS!"). */
export const ARCHETYPE_NAMES: Readonly<Record<MapKind, string>> = {
  pasillos: 'PASILLOS',
  islas: 'ISLAS',
  plaza: 'PLAZA',
  ocho: 'OCHO',
  clasico: 'CLÁSICO',
};

/** The archetype of a map seed: the first draw of its own substream, mod 4. */
export function archetypeOf(seed: number): Archetype {
  const rng = mulberry32((seed ^ ARCHETYPE_SEED_TAG) >>> 0);
  rng(); // the first draws of two close seeds are alike: drop one
  return ARCHETYPES[Math.floor(rng() * ARCHETYPES.length) % ARCHETYPES.length]!;
}

/** What an archetype asks of the draw, on the left half and the centre column (x 0-13; every cell has its mirror image). */
export interface Template {
  walls: readonly Tile[]; // furniture put before the random fill
  keep: readonly Tile[]; // floor that must stay floor (rooms, doors, plaza, rings)
  lanes: boolean; // the exits' staircase lanes (V4 by construction); archetypes that lay their own corridors do not use them
  forceWalls: boolean; // the walls win over the lanes (the Ocho's block)
  maxX: number; // the random fill stays in columns 0..maxX
  density: number; // furniture share aimed at, walls included (V7 accepts 18-24 %)
}

export type TemplateFn = (rng: Rng, exits: readonly Tile[]) => Template;
