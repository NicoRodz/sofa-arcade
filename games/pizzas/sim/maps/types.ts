// Map types: tiles and grids, a map definition, and what a versus map adds.
import type { PuestoId } from '../puestos';
import type { SIGMAS } from '../symmetry';
import type { MechId } from '../mech/ids';
import type { MutationV2 } from '../mech/mutation/ops';

export type StationKind =
  | 'crate'
  | 'board'
  | 'pot'
  | 'plates'
  | 'window'
  | 'counter'
  | 'trash'
  | 'dirty'
  | 'sink'
  | 'catapult'
  | 'saucepot'
  | 'kneader' // M, behind flags.mech.kneader (mech/letters.ts)
  | 'bellows'; // Q, behind flags.mech.woodOven
export type Tile =
  | { kind: 'wall' }
  | { kind: 'floor'; spawn: boolean; surface?: Surface; mech?: string } // mech: the letter of a mechanic tile (Z D a g * b > < ^ v =), walkable; the module decides
  | { kind: 'water' }
  | { kind: 'station'; station: StationKind; crate: number; wood?: true }; // wood: the W oven (a 'pot' that the woodOven module speeds up or freezes)
/** What a floor tile does to a chef standing on it (only in a round with `surfaces`): ice makes it slide, a belt carries it along (dx, dy) = unit direction. */
export type Surface = { kind: 'ice' } | { kind: 'belt'; dx: number; dy: number };
export type Grid = Tile[][];
export type Pos = [number, number];

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
  caves?: readonly (readonly [number, number])[]; // HAZARD_V3 patch: the two holes of the rat of the coop Rata event (it comes in by one, leaves by the other)
  mutation?: MutationV2; // the v2 mutation (stations that move, mech/mutation/ops.ts): the map needs `mutation` in its mechanics for the round to run it
  mechanics?: readonly MechId[]; // the map mechanics it uses: the lobby turns those flags on (mechFlagsOf), the parser reads their letters
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
