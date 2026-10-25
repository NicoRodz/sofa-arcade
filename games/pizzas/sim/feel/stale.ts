// Lag tolerance (council C M7, rule 3): the phone sends its stick ~30 times a second, so a gap means the packets are late or lost, not that the thumb is still.
// The last vector is trusted for STALE_MS and then fades to zero over STALE_DECAY_MS (a chef never keeps running into the bin on a WiFi hiccup);
// the held B (chop) gets a longer grace, so a short gap does not cancel the cut.
import type { Controls } from '../round/state';

export const STALE_MS = 150;
export const STALE_DECAY_MS = 150;
export const HOLD_GRACE_MS = 300;

/** The controls a chef acts on, given how long ago (ms) its phone last spoke. Fresh packets pass through untouched. */
export function staleControls(c: Controls, ageMs: number): Controls {
  if (ageMs <= STALE_MS) return c;
  const k = Math.max(0, 1 - (ageMs - STALE_MS) / STALE_DECAY_MS);
  return { ...c, x: c.x * k, y: c.y * k, b: c.b && ageMs <= HOLD_GRACE_MS };
}
