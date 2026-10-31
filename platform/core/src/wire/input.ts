import type { Slots } from '../contract/slots';
import { DEADZONE, PRESS_MOD } from './constants';

// x right+, y down+, both in [-1, 1]. btn is a bitmask (state); presses are monotonic counters (mod PRESS_MOD).
export interface InputState<S extends Slots = Slots> {
  seq: number;
  x: number;
  y: number;
  btn: number;
  presses: number[];
  ts: number; // sender Date.now()
  // Campaign signals of "Obstaculos en cadena" (plan §4 #1). Additive: a phone that never sends them is read as before. `sig` is a monotonic counter
  // like the presses (a new seq = one signal of that kind; the first sample is the baseline), `go` is a state (holding "¡ya!" starts the 3-2-1).
  sig?: { kind: S['signal']; seq: number };
  go?: boolean;
}

export function applyDeadzone(x: number, y: number, dz = DEADZONE): [number, number] {
  const mag = Math.hypot(x, y);
  if (mag < dz) return [0, 0];
  const k = Math.min(mag, 1) / mag;
  return [x * k, y * k];
}

// Press counters: a tap is never lost even if it falls between frames.
export function pressDelta(prev: number, next: number): number {
  return (((next - prev) % PRESS_MOD) + PRESS_MOD) % PRESS_MOD;
}

export class PressTracker {
  private last: number[] = [];
  reset() {
    this.last = [];
  }
  // Returns new presses per button since the previous call. The first sample after reset is a baseline,
  // and a jump over half the range is a phone that restarted its counter: neither counts as presses.
  update(presses: number[]): number[] {
    const out = presses.map((p, i) => {
      const prev = this.last[i];
      if (prev === undefined) return 0;
      const d = pressDelta(prev, p);
      return d > PRESS_MOD / 2 ? 0 : d;
    });
    this.last = presses.slice();
    return out;
  }
}

// Estimates (server clock - local clock) using the lowest-RTT sample of the last N.
export class ClockSync {
  private samples: { rtt: number; off: number }[] = [];
  constructor(private max = 10) {}
  add(rtt: number, t0: number, serverTs: number) {
    this.samples.push({ rtt, off: serverTs - (t0 + rtt / 2) });
    if (this.samples.length > this.max) this.samples.shift();
  }
  get offset(): number | null {
    if (!this.samples.length) return null;
    return this.samples.reduce((a, b) => (b.rtt < a.rtt ? b : a)).off;
  }
}
