// The living map's part of the round's hash (mixed only when it is on, so a round without it keeps its hash). The shut tiles are already in the map's hash.
import type { LiveState } from './state';

export function liveWords(l: LiveState): number[] {
  return [
    ...l.pairs.flatMap((p) => [p.state, p.pending ? 1 : 0, p.owner[0] + 1, p.owner[1] + 1, p.waited]),
    l.fountain?.last ? l.fountain.last.tick + 1 : 0,
    l.fountain?.last ? l.fountain.last.team + 2 : 0,
  ];
}
