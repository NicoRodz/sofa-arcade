// Static validator of 'bridge' (design section 3, "Puente b"). Implemented by T1c. Returns the problems of a map (rows) for a team of n chefs, [] when it is fine.
// A b stands over water (it is a shortcut: the kitchen must be playable with every b turned into ~, since a worn bridge breaks for 1200 ticks).
import type { MechValidator } from '../../mech/types';
import { DIRS, at, find, playableWithout } from '../../mech/grid';

export const bridgeValidate: MechValidator = (rows) => {
  const B = find(rows, 'b');
  if (!B.length) return [];
  const out = B.filter(([x, y]) => !DIRS.some(([dx, dy]) => '~b'.includes(at(rows, x + dx, y + dy) ?? ' '))).map(
    ([x, y]) => `bridge: b at (${x}, ${y}) is not over water`,
  );
  return [...out, ...playableWithout(rows, 'b', 'bridge')];
};
