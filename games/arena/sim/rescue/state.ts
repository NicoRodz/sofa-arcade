// What Rescue and Loot add to a round: per body the rescue contact counter and glow, the loot lying on the floor, the spawner each carried card came from, and a log
// the TV reads (feed, cues). `null` in the match when the round plays without the flag: its sim and its hash are then PR2's.
import { ALL_KINDS, type SabotageKind } from '../sabotage/kinds';

export interface Loot {
  x: number; // tile
  y: number;
  kind: SabotageKind;
  age: number; // ticks on the floor
  owner: number; // body index that was stained: locked out for LOOT_LOCK_TICKS
  from: number; // index of the pickup (spawner) the card was taken from; -1: none (an armed card has no way back)
}

export type RescueLogKind = 'rescue' | 'drop' | 'take' | 'expire';
export const RESCUE_LOG_KINDS: readonly RescueLogKind[] = ['rescue', 'drop', 'take', 'expire'];
export interface RescueEntry {
  kind: RescueLogKind;
  tick: number;
  body: number; // rescue: the freed body; drop: the stained one; take: who picked it up; expire: the stained one
  x: number;
  y: number;
  card: SabotageKind | null;
}

export interface RescueState {
  contact: number[]; // per body: consecutive ticks a teammate has been next to it while stained
  glow: number[]; // per body: ticks left of the rescue glow
  from: number[]; // per body: the pickup its card in hand came from (-1: none)
  loot: Loot[];
  log: RescueEntry[];
}

export function createRescue(bodies: number): RescueState {
  const zeros = (v: number) => Array.from({ length: bodies }, () => v);
  return { contact: zeros(0), glow: zeros(0), from: zeros(-1), loot: [], log: [] };
}

const code = (k: SabotageKind | null) => (k === null ? 0 : ALL_KINDS.indexOf(k) + 1);

/** The part of the round's hash that PR3 adds (mixed only when the flag is on). */
export const rescueWords = (r: RescueState): number[] => [
  ...r.contact,
  ...r.glow,
  ...r.from,
  ...r.loot.flatMap((l) => [l.x, l.y, code(l.kind), l.age, l.owner, l.from]),
  ...r.log.flatMap((e) => [RESCUE_LOG_KINDS.indexOf(e.kind), e.tick, e.body, e.x, e.y, code(e.card)]),
];
