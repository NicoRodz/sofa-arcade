// The stick (milli units, y down) -> one of four directions, with a dead zone and a hysteresis around the diagonals.
import { DEADZONE, HYSTERESIS_TAN } from './config';
import { DOWN, LEFT, NONE, RIGHT, UP, isHorizontal, type Dir } from './dir';

/** Float stick of a phone packet (-1..1) -> integer milli units; the sim never sees a float. */
export const toMilli = (v: number): number => Math.max(-1000, Math.min(1000, Math.round(v * 1000)));

/** `prev` is the direction quantized last tick: the axis only flips when the stick is 15 deg beyond the diagonal (tan 60 deg on the other axis). */
export function quantizeStick(sx: number, sy: number, prev: Dir): Dir {
  if (sx * sx + sy * sy < DEADZONE * DEADZONE) return NONE;
  const ax = Math.abs(sx),
    ay = Math.abs(sy);
  let vertical: boolean;
  if (prev === NONE) vertical = ay > ax;
  else if (isHorizontal(prev)) vertical = ay * 1000 > HYSTERESIS_TAN * ax;
  else vertical = !(ax * 1000 > HYSTERESIS_TAN * ay);
  return vertical ? (sy > 0 ? DOWN : UP) : sx > 0 ? RIGHT : LEFT;
}
