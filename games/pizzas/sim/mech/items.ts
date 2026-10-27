// Where a loose item may NOT ride to (the belts carry items one tile at a time): under a shut door, onto a flame, onto a bridge (design: "no admite objetos"). Read by surfaces/step.ts.
import type { Game } from '../round/state';
import { isDoor } from './gate/state';
import { FIRE } from './oil/state';

export function mechBlocksItem(g: Game, tx: number, ty: number): boolean {
  const m = g.mech;
  if (!m) return false;
  if (m.gate && !m.gate.open && isDoor(g, tx, ty)) return true; // the door is a wall for objects too
  if (m.tile?.[ty * 16 + tx] === FIRE) return true;
  return !!m.bridge?.[ty * 16 + tx];
}
