// One tick of the grid prototype (the screen calls it at a fixed 60 Hz). Mutates the state; same state + same inputs = same result.
// Tick order (the plan's fixed order, F0 part): inputs by slot -> movement. Later phases (sabotage, living map, pinatas, paint...) slot in after it.
import { steer } from './control';
import { advance } from './move';
import { NO_GRID_INPUT, type GridInput, type GridState } from './state';

export function stepGrid(s: GridState, inputs: ReadonlyMap<number, GridInput>): void {
  if (s.over) return;
  for (const b of s.bodies) steer(b, inputs.get(b.slot) ?? NO_GRID_INPUT, s.control);
  for (const b of s.bodies) advance(b);
  s.tick++;
  if (s.tick >= s.durationTicks) s.over = true;
}
