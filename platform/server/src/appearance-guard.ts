// The relay's pace guard for `appearance` (not about shape: parseClientMessage did that). At most `max` messages per rolling `windowMs` go through at once;
// the excess is not applied now, but the last one of them is applied when the window ends, so a final "Listo" is never lost. Pure: the clock and the timer are injected.
import { APPEARANCE_PER_SEC } from '@pichi/core';

export interface LastWins<T> {
  push(msg: T): void;
  dispose(): void;
}
export function createLastWins<T>(
  apply: (msg: T) => void,
  max = APPEARANCE_PER_SEC,
  windowMs = 1000,
  now: () => number = Date.now,
  later: (fn: () => void, ms: number) => unknown = (fn, ms) => (setTimeout(fn, ms) as { unref?: () => void }).unref?.(),
): LastWins<T> {
  let stamps: number[] = [];
  let pending: { msg: T } | null = null;
  let armed = false;
  let dead = false;
  const flush = () => {
    armed = false;
    const p = pending;
    pending = null;
    if (p && !dead) {
      stamps = [now()];
      apply(p.msg);
    }
  };
  return {
    push(msg) {
      const t = now();
      stamps = stamps.filter((s) => t - s < windowMs);
      if (stamps.length < max) {
        stamps.push(t);
        pending = null; // a newer message supersedes one that was waiting
        apply(msg);
        return;
      }
      pending = { msg };
      if (!armed) {
        armed = true;
        later(flush, Math.max(1, windowMs - (t - stamps[0]!)));
      }
    },
    dispose() {
      dead = true;
      pending = null;
    },
  };
}
