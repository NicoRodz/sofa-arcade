// Named substreams: `manchazo:events:<seed>` and `manchazo:clock:<seed>`. The name is hashed (FNV-1a) into a mulberry32 seed, so nothing else's draws move.
import { mulberry32, type Rng } from '@pichi/core';

export function substream(name: string): Rng {
  let h = 0x811c9dc5;
  for (let i = 0; i < name.length; i++) h = Math.imul(h ^ name.charCodeAt(i), 0x01000193);
  return mulberry32(h >>> 0);
}
