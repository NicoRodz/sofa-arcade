// STUB (T0). Implemented by T1b: replace the hooks below in this file only; the registry, the validator, the stamp, the bot and the art already point here.
import type { MechModule } from '../types';
import { noopHooks } from '../noop';
import { gateValidate } from '../../validate/mech/gate';
import { gateStamp } from '../../gen/stamps/gate';

export const gateModule: MechModule = { ...noopHooks, id: 'gate', tanda: 'T1b', validate: gateValidate, stamp: gateStamp };
