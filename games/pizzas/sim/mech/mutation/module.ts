// STUB (T0). Implemented by T1a: replace the hooks below in this file only; the registry, the validator, the stamp, the bot and the art already point here.
import type { MechModule } from '../types';
import { noopHooks } from '../noop';
import { mutationValidate } from '../../validate/mech/mutation';
import { mutationStamp } from '../../gen/stamps/mutation';

export const mutationModule: MechModule = { ...noopHooks, id: 'mutation', tanda: 'T1a', validate: mutationValidate, stamp: mutationStamp };
