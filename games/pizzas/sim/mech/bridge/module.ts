// STUB (T0). Implemented by T1c: replace the hooks below in this file only; the registry, the validator, the stamp, the bot and the art already point here.
import type { MechModule } from '../types';
import { noopHooks } from '../noop';
import { bridgeValidate } from '../../validate/mech/bridge';
import { bridgeStamp } from '../../gen/stamps/bridge';

export const bridgeModule: MechModule = { ...noopHooks, id: 'bridge', tanda: 'T1c', validate: bridgeValidate, stamp: bridgeStamp };
