// STUB (T0). Implemented by T1c: replace the hooks below in this file only; the registry, the validator, the stamp, the bot and the art already point here.
import type { MechModule } from '../types';
import { noopHooks } from '../noop';
import { oneWayValidate } from '../../validate/mech/oneWay';
import { oneWayStamp } from '../../gen/stamps/oneWay';

export const oneWayModule: MechModule = { ...noopHooks, id: 'oneWay', tanda: 'T1c', validate: oneWayValidate, stamp: oneWayStamp };
