// HAZARD_V3, map 15 (design 1.1): the rat has two caves. It comes in by one and leaves by the other, so a chef cannot wait at the hole it came from. Which one it comes in by is one draw of a sub-stream tagged
// `rat:caves:<start tick>` of the events seed, never the main stream; the caves are listed by (y, x) so the draw is the same on every machine. Pure given (g, startAt).
import type { Game } from '../round/state';
import { mulberry32 } from '@pichi/core';
import { subSeed } from '../recipes/menu';

export type Cave = readonly [number, number];

/** The [entry, exit] caves of the rat that starts at `startAt`, or null when the round has no pair of caves. */
export function ratCaves(g: Game, startAt: number): [Cave, Cave] | null {
  if (!g.caves) return null;
  const list = [...g.caves.at].sort((a, b) => a[1] - b[1] || a[0] - b[0]);
  if (list.length !== 2) return null;
  const i = Math.floor(mulberry32(subSeed(g.caves.seed, `rat:caves:${startAt}`))() * 2);
  return [list[i]!, list[1 - i]!];
}
