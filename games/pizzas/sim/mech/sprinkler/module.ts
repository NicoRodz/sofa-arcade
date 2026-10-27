// STUB (T0). Implemented by T1d: replace the hooks below in this file only; the registry, the validator, the stamp, the bot and the art already point here.
import type { MechModule } from '../types';
import { noopHooks } from '../noop';
import { sprinklerValidate } from '../../validate/mech/sprinkler';
import { sprinklerStamp } from '../../gen/stamps/sprinkler';

export const sprinklerModule: MechModule = {
  ...noopHooks,
  id: 'sprinkler',
  tanda: 'T1d',
  validate: sprinklerValidate,
  stamp: sprinklerStamp,
};
