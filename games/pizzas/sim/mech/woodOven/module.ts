// STUB (T0). Implemented by T1e: replace the hooks below in this file only; the registry, the validator, the stamp, the bot and the art already point here.
import type { MechModule } from '../types';
import { noopHooks } from '../noop';
import { woodOvenValidate } from '../../validate/mech/woodOven';
import { woodOvenStamp } from '../../gen/stamps/woodOven';

export const woodOvenModule: MechModule = { ...noopHooks, id: 'woodOven', tanda: 'T1e', validate: woodOvenValidate, stamp: woodOvenStamp };
