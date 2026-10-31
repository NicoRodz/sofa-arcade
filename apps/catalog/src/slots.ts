// The slots of this build's games put together: what a screen, a phone or a test that talks to every game reads off the wire. Each game's own types
// (PzSlots, ObstSlots) stay in the game; this is only their union for the code that composes them.
import type { ClientMsg as WireClientMsg, ServerMsg as WireServerMsg } from '@pichi/core';
import type { Slots } from '@pichi/core/contract';
import type { ObstSlots } from '@pichi/game-obstaculos/protocol';
import type { PzSlots } from '@pichi/game-pizzas/protocol';

export interface AllSlots extends Slots {
  map: PzSlots['map'];
  puesto: PzSlots['puesto'];
  signal: ObstSlots['signal'];
  result: PzSlots['result'];
}
export type ServerMsg = WireServerMsg<AllSlots>;
export type ClientMsg = WireClientMsg<AllSlots>;
