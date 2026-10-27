// STUB (T0). Implemented by T1c: replace the hooks below in this file only; the registry, the validator, the stamp, the bot and the art already point here.
import type { MechModule } from '../types';
import { noopHooks } from '../noop';
import { raftValidate } from '../../validate/mech/raft';
import { raftStamp } from '../../gen/stamps/raft';

export const raftModule: MechModule = { ...noopHooks, id: 'raft', tanda: 'T1c', validate: raftValidate, stamp: raftStamp };
