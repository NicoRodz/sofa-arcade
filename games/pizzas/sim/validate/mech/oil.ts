// Static validator of 'oil' (design section 3). Implemented by T1d. A drip `g` stays away from the window E and from every start S (3 tiles, Manhattan): oil must not greet the chefs or foul the serving
// lane from the first second. A puddle `a` must leave the kitchen playable (it is only slow floor, so only the walls matter: nothing to check beyond it being on floor).
import type { MechValidator } from '../../mech/types';
import { find } from '../../mech/grid';

export const OIL_KEEP_AWAY = 3;

export const oilValidate: MechValidator = (rows) => {
  const G = find(rows, 'g');
  if (!G.length && !find(rows, 'a').length) return [];
  const out: string[] = [];
  const near = (g: [number, number], ch: string) =>
    find(rows, ch).some(([x, y]) => Math.abs(x - g[0]) + Math.abs(y - g[1]) < OIL_KEEP_AWAY);
  for (const g of G) {
    if (near(g, 'E')) out.push(`oil: drip g at (${g[0]}, ${g[1]}) is too close to the window E`);
    if (near(g, 'S')) out.push(`oil: drip g at (${g[0]}, ${g[1]}) is too close to a start S`);
  }
  return out;
};
