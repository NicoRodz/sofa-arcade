// The sabotage part of the round's hash (mixed only when the sabotages are on, so a round without them keeps its hash).
import { ALL_KINDS } from './kinds';
import { plusWords } from './plus';
import type { SabotageState } from './state';

export function sabotageWords(a: SabotageState): number[] {
  const code = (k: string | null) => (k === null ? 0 : ALL_KINDS.indexOf(k as never) + 1);
  return [
    ...a.deck.map(code),
    ...a.pickups.flatMap((p) => [p.x, p.y, p.drawn, p.wait]),
    ...a.held.map(code),
    ...a.armed.map(code),
    ...a.roller,
    ...a.footprints,
    ...a.gust,
    a.used,
    ...(a.plus ? plusWords(a.plus) : []),
  ];
}
