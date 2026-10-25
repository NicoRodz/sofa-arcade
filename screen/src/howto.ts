// "Cómo se juega" card on the big screen: timing and key handling, kept free of the DOM so it can be tested.
import type { Phase } from '@party/shared';

export const HOWTO_MS = 10_000;
// start: shown before the countdown, runs out by itself and Enter skips it. preview: opened from the lobby with H, no timer.
export type HowToMode = 'start' | 'preview';
export interface HowToState {
  mode: HowToMode;
  startedAt: number;
}
export type HowToAction = 'open-preview' | 'skip' | 'close' | 'none';

export const secondsLeft = (startedAt: number, now: number, total = HOWTO_MS) => Math.max(0, Math.ceil((startedAt + total - now) / 1000));
export const progress = (startedAt: number, now: number, total = HOWTO_MS) => Math.min(1, Math.max(0, (now - startedAt) / total));
export const isExpired = (s: HowToState, now: number, total = HOWTO_MS) => s.mode === 'start' && now - s.startedAt >= total;

export function howToOnKey(state: HowToState | null, phase: Phase, key: string): HowToAction {
  const h = key === 'h' || key === 'H';
  if (!state) return h && phase === 'lobby' ? 'open-preview' : 'none';
  if (state.mode === 'start') return key === 'Enter' ? 'skip' : 'none';
  return h || key === 'Enter' || key === 'Escape' ? 'close' : 'none';
}
