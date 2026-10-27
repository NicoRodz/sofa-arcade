// One-way tiles (design section 3, "Vaivén"): a > < ^ v tile can only be entered moving in its sense. Leaving is free. Implemented by T1c.
import type { MechModule } from '../types';
import { noopHooks } from '../noop';
import { oneWayValidate } from '../../validate/mech/oneWay';
import { oneWayStamp } from '../../gen/stamps/oneWay';

export const SENSE: Record<string, readonly [number, number]> = { '>': [1, 0], '<': [-1, 0], '^': [0, -1], v: [0, 1] };

export const oneWayModule: MechModule = {
  ...noopHooks,
  id: 'oneWay',
  tanda: 'T1c',
  validate: oneWayValidate,
  stamp: oneWayStamp,
  canEnter(g, tx, ty, dir) {
    const t = g.grid[ty]?.[tx];
    const s = t?.kind === 'floor' && t.mech ? SENSE[t.mech] : undefined;
    return !s || (s[0] === dir[0] && s[1] === dir[1]);
  },
};
