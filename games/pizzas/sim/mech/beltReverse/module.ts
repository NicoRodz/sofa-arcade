// STUB (T0). Implemented by T1b: replace the hooks below in this file only; the registry, the validator, the stamp, the bot and the art already point here.
import type { MechModule } from '../types';
import { noopHooks } from '../noop';
import { beltReverseValidate } from '../../validate/mech/beltReverse';
import { beltReverseStamp } from '../../gen/stamps/beltReverse';

export const beltReverseModule: MechModule = {
  ...noopHooks,
  id: 'beltReverse',
  tanda: 'T1b',
  validate: beltReverseValidate,
  stamp: beltReverseStamp,
};
