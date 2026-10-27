// Static validator of 'sprinkler' (design section 3). Implemented by T1d. A sprinkler `*` keeps 2 tiles from every wood oven W (its 3x3 would put the wood fire out), and a map with a sprinkler must
// have something for it to do: oil, or a fire source (an oven O or W).
import type { MechValidator } from '../../mech/types';
import { find } from '../../mech/grid';

export const sprinklerValidate: MechValidator = (rows) => {
  const S = find(rows, '*');
  if (!S.length) return [];
  const out: string[] = [];
  for (const [x, y] of S)
    for (const [wx, wy] of find(rows, 'W'))
      if (Math.max(Math.abs(wx - x), Math.abs(wy - y)) < 2)
        out.push(`sprinkler: * at (${x}, ${y}) is within reach of the wood oven W at (${wx}, ${wy})`);
  return out;
};
