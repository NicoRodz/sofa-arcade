// STUB (T0). Implemented by T2: replace the hooks below in this file only; the registry, the validator, the stamp, the bot and the art already point here.
import type { MechModule } from '../types';
import { noopHooks } from '../noop';
import { heavyTrayValidate } from '../../validate/mech/heavyTray';
import { heavyTrayStamp } from '../../gen/stamps/heavyTray';

export const heavyTrayModule: MechModule = {
  ...noopHooks,
  id: 'heavyTray',
  tanda: 'T2',
  validate: heavyTrayValidate,
  stamp: heavyTrayStamp,
};
