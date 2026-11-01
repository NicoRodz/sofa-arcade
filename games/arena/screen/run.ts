// The round Arena is running on this screen, and the phones' latest packets. Module state, created lazily: nothing runs when the file loads.
import { createArena, step, type ArenaInput, type ArenaState } from '../sim';

export const STEP_MS = 1000 / 60;
export const OVER_BANNER_MS = 3200; // how long the winner shows before the results screen

interface Pad {
  x: number;
  y: number;
  seen: readonly number[]; // presses counters at the last step: a press is a counter that grew
  push: boolean;
  dash: boolean;
}

export class ArenaRun {
  readonly state: ArenaState;
  private pads = new Map<number, Pad>();
  private acc = 0;
  private overFor = 0;

  constructor(slots: readonly number[], seed: number) {
    this.state = createArena(slots, seed);
  }

  /** The latest packet of a phone (x, y and the two presses counters). */
  receive(slot: number, x: number, y: number, presses: readonly number[]) {
    const p = this.pads.get(slot) ?? { x: 0, y: 0, seen: presses, push: false, dash: false }; // the first packet only sets the baseline
    p.x = x;
    p.y = y;
    if (presses[0] !== p.seen[0]) p.push = true;
    if (presses[1] !== p.seen[1]) p.dash = true;
    p.seen = presses;
    this.pads.set(slot, p);
  }

  /** Advances by a frame's time in fixed steps. Returns true once, when the winner has been shown long enough. */
  advance(deltaMs: number): boolean {
    if (this.state.over) {
      this.overFor += deltaMs;
      return this.overFor - deltaMs < OVER_BANNER_MS && this.overFor >= OVER_BANNER_MS;
    }
    this.acc = Math.min(this.acc + deltaMs, STEP_MS * 6); // a stalled tab does not fast-forward the round
    while (this.acc + 1e-9 >= STEP_MS && !this.state.over) {
      const inputs = new Map<number, ArenaInput>();
      for (const [slot, p] of this.pads) {
        inputs.set(slot, { x: p.x, y: p.y, push: p.push, dash: p.dash });
        p.push = p.dash = false;
      }
      step(this.state, inputs, STEP_MS);
      this.acc -= STEP_MS;
    }
    return false;
  }
}

export const run: { arena: ArenaRun | null } = { arena: null };
