// STUB (T0). Implemented by T1b: replace the hooks below in this file only; the registry, the validator, the stamp, the bot and the art already point here.
import type { MechModule } from '../types';
import { noopHooks } from '../noop';
import { ovenHeatValidate } from '../../validate/mech/ovenHeat';
import { ovenHeatStamp } from '../../gen/stamps/ovenHeat';

export const ovenHeatModule: MechModule = { ...noopHooks, id: 'ovenHeat', tanda: 'T1b', validate: ovenHeatValidate, stamp: ovenHeatStamp };
