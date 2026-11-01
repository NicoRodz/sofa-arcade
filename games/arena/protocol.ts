// What Arena tells the platform about the opaque slots of the wire protocol: nothing. It has no maps, no puestos and no signals, so every slot stays at
// the platform's default and the game only needs its id (the conformance suite checks it matches the manifest and the phone).
import type { GameProtocol } from '@pichi/core/contract';

export const arenaProtocol: GameProtocol = { game: 'arena' };
