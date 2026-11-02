// The grid round running on this screen, fed by the phones' packets: the latest stick of each phone is held for as many fixed 60 Hz ticks as the frame holds.
import { createGrid, stepGrid, toMilli, type ControlPlan, type GridInput, type GridState } from '../../sim';

export const GRID_STEP_MS = 1000 / 60;
export const GRID_OVER_MS = 3200;

export class GridRun {
  readonly state: GridState;
  private sticks = new Map<number, GridInput>();
  private acc = 0;
  private overFor = 0;

  constructor(slots: readonly number[], control: ControlPlan) {
    this.state = createGrid({ slots, control });
  }

  /** The latest packet of a phone: its stick, in the sim's integer milli units. */
  receive(slot: number, x: number, y: number) {
    this.sticks.set(slot, { sx: toMilli(x), sy: toMilli(y) });
  }

  /** Advances by a frame's time in fixed ticks. Returns true once, when the round has been over long enough. */
  advance(deltaMs: number): boolean {
    if (this.state.over) {
      this.overFor += deltaMs;
      return this.overFor - deltaMs < GRID_OVER_MS && this.overFor >= GRID_OVER_MS;
    }
    this.acc = Math.min(this.acc + deltaMs, GRID_STEP_MS * 6); // a stalled tab does not fast-forward the round
    while (this.acc + 1e-9 >= GRID_STEP_MS && !this.state.over) {
      stepGrid(this.state, this.sticks);
      this.acc -= GRID_STEP_MS;
    }
    return false;
  }
}

export const gridRun: { run: GridRun | null } = { run: null };
