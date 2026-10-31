// EVENTS_V2: the mood of the music while an event with presence is on: tempo, a low-pass and a level (design pizzas-tanda2 section 4). Two events at once: the latest wins.
// Pure table and stack; the director applies them (0.5 s of glide) to the music bus only, never to the sfx.
import type { EventKind } from '../../sim/midround';

export interface Mood {
  bpmMul: number; // tempo multiplier
  lowpassHz: number; // 20000 = open
  gainDb: number;
}
export const NEUTRAL: Mood = { bpmMul: 1, lowpassHz: 20_000, gainDb: 0 };
export const MOODS: Partial<Record<EventKind, Mood>> = {
  rush: { bpmMul: 1.12, lowpassHz: 20_000, gainDb: 1 }, // x1.12 with the percussion kept to the close
  birthday: { bpmMul: 1.05, lowpassHz: 20_000, gainDb: 0 },
  blackout: { bpmMul: 1, lowpassHz: 600, gainDb: -8 }, // muffled: the hum is gone
  spill: { bpmMul: 0.97, lowpassHz: 5000, gainDb: 0 },
};
export const GLIDE_S = 0.5;

/** The stack after an event turned on or off (a repeat moves it to the top). */
export const moodStack = (stack: readonly EventKind[], kind: EventKind, on: boolean): EventKind[] => [
  ...stack.filter((k) => k !== kind),
  ...(on ? [kind] : []),
];
export const moodOf = (stack: readonly EventKind[]): Mood => (stack.length ? (MOODS[stack[stack.length - 1]!] ?? NEUTRAL) : NEUTRAL);
