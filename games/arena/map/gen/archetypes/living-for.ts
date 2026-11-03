// Where an archetype wants its living elements, read off the map: the sofas across the corridors of Pasillos (they are its doors), the brushes in the middle of
// the rooms of Islas. Anchors only: placeLiving still keeps a pair only if V1-V3 hold in every combination of states.
import { MAP_H } from '../../layout';
import { solidAt, type Tile, type TileMap } from '../../tile-map';
import { LIVING_MAX_X } from '../living-shapes';
import type { MapKind } from './kinds';
import { corridorRows } from './rooms';

export interface LivingPlan {
  kind: 'brush' | 'sofa';
  anchors: readonly Tile[]; // where the pivot (brush) or the first rail tile (sofa) may go, in the order they are tried after a seeded rotation
  variant?: number; // fixed variant (the sofa across a corridor is a vertical rail)
}

/** null: the archetype has no preference (the pairs go anywhere free, as before). */
export function livingPlan(kind: MapKind, m: TileMap): LivingPlan | null {
  if (kind === 'pasillos') {
    const anchors: Tile[] = [];
    for (const y of corridorRows(m)) for (let x = 5; x <= LIVING_MAX_X; x++) anchors.push([x, y - 1]); // a rail of 3 across the 3 rows around the corridor
    return anchors.length ? { kind: 'sofa', anchors, variant: 1 } : null;
  }
  if (kind === 'islas') {
    const anchors: Tile[] = []; // every tile with its whole 3x3 free (the inside of a room), left of column 10
    for (let y = 1; y < MAP_H - 1; y++)
      for (let x = 1; x <= LIVING_MAX_X; x++)
        if ([-1, 0, 1].every((dy) => [-1, 0, 1].every((dx) => !solidAt(m, x + dx, y + dy)))) anchors.push([x, y]);
    return anchors.length ? { kind: 'brush', anchors } : null;
  }
  return null;
}
