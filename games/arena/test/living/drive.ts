// Test helpers for the living map: an empty 27x15 floor with chosen elements on it, and a body put on a tile.
import { emptyMap, floorCount, type LivingSpec } from '../../map';
import { createLive, createManchazo, type ManchazoState } from '../../sim';

export const brush = (x = 4, y = 4, variant = 0, phase = 0): LivingSpec => ({ kind: 'brush', x, y, variant, phase });
export const sofa = (x = 4, y = 4, variant = 0, phase = 0): LivingSpec => ({ kind: 'sofa', x, y, variant, phase });
export const fountain = (phase = 0): LivingSpec => ({ kind: 'fountain', x: 13, y: 7, variant: 0, phase });

/** A round on open floor (the exits of a generated map) with the given elements; bodies start on their exits. */
export function openRound(specs: LivingSpec[], teams: readonly number[] = [0, 1]): ManchazoState {
  const s = createManchazo({ slots: teams.map((_t, i) => i), teams, seed: 1, mapSeed: 5 });
  const map = emptyMap(s.grid.map.spawns);
  s.grid.map = map;
  s.match.paintable = floorCount(map);
  s.match.live = createLive(map, specs);
  return s;
}
export const at = (tx: number, ty: number): [number, number] => [tx * 16 + 8, ty * 16 + 8];
export const tileOf = (s: ManchazoState, i: number): [number, number] => [
  Math.floor(s.grid.bodies[i]!.x / 16),
  Math.floor(s.grid.bodies[i]!.y / 16),
];
