// The Manchazo round running on this screen, fed by the phones' packets: the latest stick of each phone, and button 1 (a counter that grew = one pinata).
import { toMilli, type ControlPlan } from '../../sim';
import { createManchazo, stepManchazo, type ManchazoInput, type ManchazoState } from '../../sim';

export const MATCH_STEP_MS = 1000 / 60;
export const MATCH_OVER_MS = 4500; // the final board stays on the field this long before the results

interface Pad {
  sx: number;
  sy: number;
  seen: readonly number[]; // presses counters at the last packet
  drop: boolean; // a press arrived since the last tick
}

export class ManchazoRun {
  readonly state: ManchazoState;
  private pads = new Map<number, Pad>();
  private acc = 0;
  private overFor = 0;

  constructor(slots: readonly number[], teams: readonly number[], seed: number, control?: ControlPlan) {
    this.state = createManchazo({ slots, teams, seed, ...(control ? { control } : {}) });
  }

  /** The latest packet of a phone: x and y in [-1, 1] (integer milli units from here on) and its presses counters. The first packet is only a baseline. */
  receive(slot: number, x: number, y: number, presses: readonly number[]) {
    const p = this.pads.get(slot) ?? { sx: 0, sy: 0, seen: presses, drop: false };
    p.sx = toMilli(x);
    p.sy = toMilli(y);
    if (presses[0] !== p.seen[0]) p.drop = true;
    p.seen = presses;
    this.pads.set(slot, p);
  }

  /** Advances by a frame's time in fixed 60 Hz ticks. Returns true once, when the final board has been shown long enough. */
  advance(deltaMs: number): boolean {
    const g = this.state.grid;
    if (g.over) {
      this.overFor += deltaMs;
      return this.overFor - deltaMs < MATCH_OVER_MS && this.overFor >= MATCH_OVER_MS;
    }
    this.acc = Math.min(this.acc + deltaMs, MATCH_STEP_MS * 6); // a stalled tab does not fast-forward the round
    while (this.acc + 1e-9 >= MATCH_STEP_MS && !g.over) {
      const inputs = new Map<number, ManchazoInput>();
      for (const [slot, p] of this.pads) {
        inputs.set(slot, { sx: p.sx, sy: p.sy, drop: p.drop });
        p.drop = false;
      }
      stepManchazo(this.state, inputs);
      this.acc -= MATCH_STEP_MS;
    }
    return false;
  }
}

export const matchRun: { run: ManchazoRun | null } = { run: null };
