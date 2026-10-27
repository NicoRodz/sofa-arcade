// STUB (T0). Implemented by T1e: replace the hooks below in this file only; the registry, the validator, the stamp, the bot and the art already point here.
import type { MechModule } from '../types';
import { noopHooks } from '../noop';
import { kneaderValidate } from '../../validate/mech/kneader';
import { kneaderStamp } from '../../gen/stamps/kneader';

export const kneaderModule: MechModule = { ...noopHooks, id: 'kneader', tanda: 'T1e', validate: kneaderValidate, stamp: kneaderStamp };
