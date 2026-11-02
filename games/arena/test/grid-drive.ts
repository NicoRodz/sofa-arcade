// Test-only driver for the grid sim: a fixed input per tick, and a snapshot of the one body the test cares about.
import { createGrid, stepGrid, type GridConfig, type GridInput, type GridState } from '../sim';

export const stick = (sx: number, sy: number): GridInput => ({ sx, sy });
export const RIGHT_STICK = stick(1000, 0);
export const DOWN_STICK = stick(0, 1000);
export const LEFT_STICK = stick(-1000, 0);
export const UP_STICK = stick(0, -1000);
export const REST = stick(0, 0);

export const solo = (cfg: Partial<GridConfig> = {}): GridState => createGrid({ slots: [0], durationTicks: 1_000_000, ...cfg });

/** Holds `inp` on slot 0 for `ticks` ticks. */
export function hold(s: GridState, inp: GridInput, ticks: number): void {
  for (let i = 0; i < ticks; i++) stepGrid(s, new Map([[0, inp]]));
}
