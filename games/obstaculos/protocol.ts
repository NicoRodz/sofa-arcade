// What Obstaculos tells the platform about the opaque slots of the wire protocol: the campaign signals a phone may send in `sig.kind`.
import type { GameProtocol, Slots } from '@pichi/core/contract';
import { SIGNAL_KINDS, type SignalKind } from './sim/campaign';

export interface ObstSlots extends Slots {
  signal: SignalKind;
}

export const obstaculosProtocol: GameProtocol = { game: 'obstaculos', signalKinds: SIGNAL_KINDS };
