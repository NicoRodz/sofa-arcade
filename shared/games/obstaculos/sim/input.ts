// Phone packets -> per-step input, tolerant to lag (plan §2 "Lag"). Absolute stick (the latest packet wins), press counters
// turned into at most one jump buffered, B deltas replayed as toggles on consecutive frames (max 2), stale stick decaying.
// Time is the caller's simulation clock in ms, never Date.now(): the world stays deterministic.
import { GRAB_TOGGLES_MAX, STALE_DECAY_MS, STALE_MS, STICK_DEADZONE, STICK_DOWN, STICK_HALF_MAX, STICK_HALF_SPEED } from '../constants';
import { PressTracker } from '../../../protocol';
import type { SignalKind } from './campaign';
import type { StepInput } from './player';

// signal / goHeld are the campaign's (dynamic 1). The protocol only carries 2 press counters today: how they travel is the phone's business (S3),
// this tracker takes `signal.seq` as a monotonic counter (a new value = one signal) and `goHeld` as a state.
export interface Packet { x: number; y: number; presses: readonly number[]; signal?: { kind: SignalKind; seq: number }; goHeld?: boolean }
export interface PlayerStep extends StepInput { grab: boolean; up: boolean; signal?: SignalKind; goHeld?: boolean } // grab: apply one B toggle this step

// |x| < deadzone: stopped; below 0.6: 45 % of top speed; above: 100 %.
export function quantizeStick(x: number): number {
  const a = Math.abs(x);
  if (a < STICK_DEADZONE) return 0;
  return Math.sign(x) * (a < STICK_HALF_MAX ? STICK_HALF_SPEED : 1);
}

export class InputTracker {
  private presses = new PressTracker();
  private x = 0;
  private y = 0;
  private lastRx = -Infinity;
  private jumps = 0;
  private grabs = 0;
  private sigSeq: number | null = null;
  private sig: SignalKind | null = null;
  private goHeld = false;

  receive(p: Packet, nowMs: number): void {
    const d = this.presses.update(p.presses as number[]);
    this.jumps += d[0] ?? 0;
    this.grabs = Math.min(GRAB_TOGGLES_MAX, this.grabs + (d[1] ?? 0));
    this.x = p.x;
    this.y = p.y;
    this.lastRx = nowMs;
    this.goHeld = p.goHeld === true;
    if (p.signal) {
      if (this.sigSeq !== null && p.signal.seq !== this.sigSeq) this.sig = p.signal.kind; // the first sample is the baseline, like the press counters
      this.sigSeq = p.signal.seq;
    }
  }

  step(nowMs: number): PlayerStep {
    const age = nowMs - this.lastRx;
    const scale = age <= STALE_MS ? 1 : Math.max(0, 1 - (age - STALE_MS) / STALE_DECAY_MS);
    const jump = this.jumps > 0; // several presses between steps are one jump
    this.jumps = 0;
    const grab = this.grabs > 0;
    if (grab) this.grabs--;
    const out: PlayerStep = { move: quantizeStick(this.x * scale), down: this.y * scale > STICK_DOWN, up: this.y * scale < -STICK_DOWN, jump, grab };
    if (this.sig) { out.signal = this.sig; this.sig = null; }
    if (this.goHeld) out.goHeld = true;
    return out;
  }

  reset(): void { this.presses.reset(); this.x = 0; this.y = 0; this.lastRx = -Infinity; this.jumps = 0; this.grabs = 0; this.sigSeq = null; this.sig = null; this.goHeld = false; }
}
