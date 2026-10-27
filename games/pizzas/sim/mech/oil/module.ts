// STUB (T0). Implemented by T1d: replace the hooks below in this file only; the registry, the validator, the stamp, the bot and the art already point here.
import type { MechModule } from '../types';
import { noopHooks } from '../noop';
import { oilValidate } from '../../validate/mech/oil';
import { oilStamp } from '../../gen/stamps/oil';

export const oilModule: MechModule = { ...noopHooks, id: 'oil', tanda: 'T1d', validate: oilValidate, stamp: oilStamp };
