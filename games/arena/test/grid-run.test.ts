import { describe, expect, it } from 'vitest';
import { GRID_OVER_MS, GRID_STEP_MS, GridRun } from '../screen/grid/grid-run';
import { gridPlan } from '../screen/grid/mode';

describe('grid run (the phones feeding the grid sim)', () => {
  it('the control plan comes from ?control=A|B only; without it Arena is untouched', () => {
    expect([gridPlan(''), gridPlan('?soon=1'), gridPlan('?control=a'), gridPlan('?soon=1&control=B'), gridPlan('?control=C')]).toEqual([
      null,
      null,
      'A',
      'B',
      null,
    ]);
  });

  it('the latest stick of a phone steers its body for as many 60 Hz ticks as the frame holds', () => {
    const r = new GridRun([0, 1], 'A');
    r.receive(0, 1, 0);
    r.advance(GRID_STEP_MS * 3);
    expect(r.state.tick).toBe(3);
    expect(r.state.bodies[0]!.x).toBeGreaterThan(8);
    expect(r.state.bodies[1]!.x).toBe(26 * 16 + 8); // no packet from the other phone: it stands on its spawn
  });

  it('the float stick of the packet reaches the sim as integer milli units', () => {
    const r = new GridRun([0], 'A');
    r.receive(0, 0.3333333, -0.9);
    r.advance(GRID_STEP_MS);
    expect(r.stickOf(0)).toEqual({ sx: 333, sy: -900 });
    expect(Number.isInteger(r.stickOf(0)!.sx) && Number.isInteger(r.stickOf(0)!.sy)).toBe(true);
    expect(r.state.bodies[0]!.q).toBe(3); // UP
  });

  it('a stalled frame does not fast-forward, and the end is announced exactly once', () => {
    const r = new GridRun([0], 'B');
    r.advance(10_000);
    expect(r.state.tick).toBeLessThanOrEqual(6);
    r.state.over = true;
    const done = Array.from({ length: 20 }, () => r.advance(GRID_OVER_MS / 10)).filter(Boolean);
    expect(done).toHaveLength(1);
  });
});
