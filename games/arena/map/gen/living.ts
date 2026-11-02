// The living map's hook (F5). A living element is a mover that, in each of its states, shuts some tiles (a sofa on its rail, a brush arm across a corridor).
// F2 has none: `mapStates` then yields the base map alone. F5 adds mirrored pairs here and the state validators (V1-V3) run on every combination.
import type { Tile, TileMap } from '../tile-map';

export interface LivingElement {
  id: string;
  states: number; // how many positions it cycles through
  /** The tiles it closes in a given state (0 .. states - 1). */
  closed(state: number): readonly Tile[];
}

export const MAX_LIVING_PAIRS = 4; // the plan's cap: 4 pairs, so at most states^4 combinations

export interface MapState {
  states: readonly number[]; // chosen state of each living element, in order
  map: TileMap;
}

/** Every combination of states of the living elements (the base map alone when there are none), each as a TileMap with the closed tiles turned into furniture. */
export function mapStates(base: TileMap, living: readonly LivingElement[]): MapState[] {
  if (living.length === 0) return [{ states: [], map: base }];
  let combos: number[][] = [[]];
  for (const el of living) combos = combos.flatMap((c) => Array.from({ length: el.states }, (_, s) => [...c, s]));
  return combos.map((states) => {
    const solid = base.solid.slice();
    states.forEach((s, k) => {
      for (const [x, y] of living[k]!.closed(s)) solid[y * base.w + x] = 1;
    });
    return { states, map: { ...base, solid } };
  });
}
