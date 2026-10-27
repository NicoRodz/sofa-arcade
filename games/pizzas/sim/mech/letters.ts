// Parser side of the mechanics: a new tile letter is read only when its flag is on. Without the flag it is a load ERROR, never a floor tile.
// Tile shapes (fixed in T0 so the tandas do not touch maps/types.ts): M and Q are stations ('kneader', 'bellows'); W is an oven ('pot' with wood: true);
// every other letter is a walkable floor tile carrying its letter in `mech` (the module decides what it does: gate closed, bridge, raft, one-way...).
import type { Tile } from '../maps/types';
import { MECH_LETTER_IDS, type MechId, type MechOpts } from './ids';

const TILES: Record<string, Tile> = {
  M: { kind: 'station', station: 'kneader', crate: 0 },
  Q: { kind: 'station', station: 'bellows', crate: 0 },
  W: { kind: 'station', station: 'pot', crate: 0, wood: true },
};

export const mechLetterId = (c: string): MechId | undefined => (Object.hasOwn(MECH_LETTER_IDS, c) ? MECH_LETTER_IDS[c] : undefined);

/** The tile of a mechanic letter, or null when the letter is not one or its flag is off (the caller turns null into the load error). Coop only: `versus` refuses them all. */
export function mechTile(c: string, versus: boolean, flags: MechOpts | undefined): Tile | null {
  const id = mechLetterId(c);
  if (!id || versus || !flags?.[id]) return null;
  return TILES[c] ?? { kind: 'floor', spawn: false, mech: c };
}
