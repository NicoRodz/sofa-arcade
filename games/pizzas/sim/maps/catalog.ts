// The fixed (coop) maps and what the lobby and the settings know about them.
import type { Difficulty } from '@pichi/core/difficulty';
import { MAP_1 } from './layouts/cocina-abierta';
import { MAP_2 } from './layouts/isla-central';
import { MAP_3 } from './layouts/el-rio';
import { MAP_4 } from './layouts/pasillo';
import { MAP_5 } from './layouts/cinta';
import { MAP_6 } from './layouts/la-ventanita';
import { MAP_7 } from './layouts/food-truck';
import { MAP_8 } from './layouts/espejo';
import { MAP_9 } from './layouts/la-trattoria';
import { MAP_10 } from './layouts/el-lavadero';
import { MAP_11 } from './layouts/tres-carriles';
import { MAP_12 } from './layouts/linea-de-montaje';
import { MAP_13 } from './layouts/tres-cuartos';
import { MAP_14 } from './layouts/dos-brigadas';
import { MAP_15 } from './layouts/el-sotano';
import { MAP_21 } from './layouts/series/cinta-de-hornos';
import { MAP_22 } from './layouts/series/dos-alas';
import { MAP_24 } from './layouts/series/el-rio';
import { MAP_23 } from './layouts/series/la-terraza';
import { MAP_25 } from './layouts/series/la-nonna';
import { MAP_26 } from './layouts/series/pasaplatos';
import { MAP_27 } from './layouts/series/isla-de-hornos';
import { MAP_28 } from './layouts/series/cocina-espejo';
import { MAP_20 } from './layouts/series/doble-cubierta';
import { TALLER_MAPS } from './layouts/taller';
import { MAP_16 } from './layouts/pista-de-hielo';
import { MAP_17 } from './layouts/cinta-de-sushi';
import { MAP_18 } from './layouts/cocina-resbaladiza';
import { MAP_19 } from './layouts/linea-de-montaje-con-cinta';
import type { MapDef } from './types';

// Spawns: the 'S' tiles are the spawn slots; slot i goes to the i-th chef (see puestos: spawn i sits next to puesto i).
// minDuro is derived (validate.minPlayers): the river maps 3 and 5 need one player per bank (the design guessed 1 for map 5).
// Map 5 is drawn with the conveyor belt (design section 2) in the design doc; the belt is not implemented,
// so this uses the documented fallback: the belt becomes a second passing counter at (7, 2).
export const FIXED_MAPS: readonly MapDef[] = [
  MAP_1,
  MAP_2,
  MAP_3,
  MAP_4,
  MAP_5,
  MAP_6,
  MAP_7,
  MAP_8,
  MAP_9,
  MAP_10,
  MAP_11,
  MAP_12,
  MAP_13,
  MAP_14,
  MAP_15,
];

// The surface maps (ice, floor belts), coop only. Apart from FIXED_MAPS (the fifteen of the original design, pinned by many tests): the lobby draws from both
// (COOP_MAPS) and turns `surfaces` on for these (usesSurfaces); a versus round never draws from this list.
export const SURFACE_MAPS: readonly MapDef[] = [MAP_16, MAP_17, MAP_18, MAP_19];
// The Carta larga series (ids 20+): two topping crates and the new recipes; coop only. The first of the campaign of the new plates.
export const SERIES_MAPS: readonly MapDef[] = [MAP_20, MAP_21, MAP_22, MAP_23, MAP_24, MAP_25, MAP_26, MAP_27, MAP_28];
// The Taller series (ids 29-36): curated maps of the new mechanics, to be tried by hand. Plain recipes; the lobby has its own group for them.
export { TALLER_MAPS };
export const COOP_MAPS: readonly MapDef[] = [...FIXED_MAPS, ...SURFACE_MAPS, ...SERIES_MAPS, ...TALLER_MAPS];

// Mechanics a map brings: a cheese crate ('3') makes Margarita orders, a sink ('L') turns on plate washing.
export const mapFeatures = (rows: readonly string[]) => ({
  cheese: rows.some((r) => r.includes('3')),
  sink: rows.some((r) => r.includes('L')),
});

/** Which page of the lobby's map grid a coop map lives on. */
export const groupOfMap = (id: string): 'classic' | 'series' | 'taller' =>
  SERIES_MAPS.some((m) => m.id === id) ? 'series' : TALLER_MAPS.some((m) => m.id === id) ? 'taller' : 'classic';

export const MAP_IDS = COOP_MAPS.map((m) => m.id);
export const fixedMap = (id: string): MapDef | undefined => COOP_MAPS.find((m) => m.id === id);

// Which fixed maps each difficulty draws from.
export const MAPS_BY_DIFFICULTY: Record<Difficulty, readonly string[]> = {
  easy: ['1', '2'],
  normal: ['2', '3', '4', '16', '17'],
  hard: ['4', '5', '18', '19'],
};

export const MAP_CHOICES = ['auto', ...MAP_IDS, 'random'] as const;
export type MapChoice = (typeof MAP_CHOICES)[number];
export const DEFAULT_MAP: MapChoice = 'auto';
export const isMapChoice = (v: unknown): v is MapChoice => MAP_CHOICES.includes(v as MapChoice);
