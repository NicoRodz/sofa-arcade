// The map validators V1-V7 of the plan, composed. V1-V3 hold in every state of the living map; V4-V7 are judged on the base map. F5 passes its living
// elements; F2 passes none, so there is one state. `validateMap` lists every failure; `isValidMap` stops at the first (what the generator loops on).
import type { TileMap } from '../tile-map';
import { mapStates, type LivingElement } from './living';
import { v4Equidistance, v5EvenArea, v6DeadEnds, v7Density } from './validate-base';
import { v1Connection, v2Crossings, v3Exits } from './validate-state';

export type Check = (m: TileMap) => string | null;
export interface Violation {
  id: string; // V1 .. V7
  detail: string;
  states?: readonly number[]; // which combination of the living map failed (state validators only)
}

/** In order of cost, cheapest first. */
export const STATE_CHECKS: readonly (readonly [string, Check])[] = [
  ['V3', v3Exits],
  ['V2', v2Crossings],
  ['V1', v1Connection],
];
export const BASE_CHECKS: readonly (readonly [string, Check])[] = [
  ['V7', v7Density],
  ['V6', v6DeadEnds],
  ['V4', v4Equidistance],
  ['V5', v5EvenArea],
];

export function validateMap(base: TileMap, living: readonly LivingElement[] = [], all = true): Violation[] {
  const out: Violation[] = [];
  for (const [id, check] of BASE_CHECKS) {
    const detail = check(base);
    if (detail !== null) out.push({ id, detail });
    if (out.length && !all) return out;
  }
  for (const st of mapStates(base, living))
    for (const [id, check] of STATE_CHECKS) {
      const detail = check(st.map);
      if (detail !== null) out.push({ id, detail, states: st.states });
      if (out.length && !all) return out;
    }
  return out;
}

export const isValidMap = (m: TileMap, living: readonly LivingElement[] = []): boolean => validateMap(m, living, false).length === 0;
