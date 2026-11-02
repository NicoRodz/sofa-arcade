import { describe, expect, it } from 'vitest';
import { DOWN, NONE, RIGHT, turnReport } from '../sim';
import { DOWN_STICK, LEFT_STICK, REST, RIGHT_STICK, UP_STICK, hold, solo } from './grid-drive';

// Row 0 is open; below it the furniture of '.##.....#' blocks columns 1 and 2, column 3 (x 48..63, centre 56) is free.
describe('grid control, plan A (default)', () => {
  it('the body goes where the stick points and stands when it is released', () => {
    const s = solo();
    expect(s.control).toBe('A');
    hold(s, RIGHT_STICK, 30);
    const b = s.bodies[0]!;
    expect(b.dir).toBe(RIGHT);
    expect(b.x).toBeGreaterThan(30);
    expect(b.y).toBe(8);
    hold(s, REST, 1);
    const x = b.x;
    hold(s, REST, 30);
    expect([b.dir, b.x]).toEqual([NONE, x]);
  });

  it('reverses at once and moves 4 tiles a second (64 units/s)', () => {
    const s = solo();
    hold(s, RIGHT_STICK, 60);
    expect(s.bodies[0]!.x).toBe(8 + 64);
    hold(s, LEFT_STICK, 30);
    expect(s.bodies[0]!.x).toBe(8 + 64 - 32);
  });

  it('a turn asked just before a free junction is buffered and runs there (aligned to its centre)', () => {
    const s = solo();
    hold(s, RIGHT_STICK, 40); // x = 8 + 42 = 50... past tile 3's assist edge? it is inside tile 3 (48..63), 6 units from its centre
    const b = s.bodies[0]!;
    b.x = 44; // 12 before the centre of tile 3: out of the 5-unit assist, so the turn waits
    hold(s, DOWN_STICK, 1);
    expect([b.dir, b.y]).toEqual([RIGHT, 8]); // still running right, request pending
    hold(s, DOWN_STICK, 20);
    expect(b.x).toBe(56);
    expect(b.dir).toBe(DOWN);
    expect(b.y).toBeGreaterThan(8);
    expect(turnReport(s)).toMatchObject({
      requested: 2,
      executed: 2,
      failed: 0,
    }); // the start from rest and the turn
  });

  it('corner assist: within 0.35 tile of a centre the turn happens now, the body is aligned', () => {
    const s = solo();
    hold(s, RIGHT_STICK, 5);
    const b = s.bodies[0]!;
    b.x = 52; // 4 units before centre 56
    hold(s, DOWN_STICK, 1);
    expect(b.dir).toBe(DOWN);
    expect(b.x).toBe(56);
    const t = solo();
    hold(t, RIGHT_STICK, 5);
    t.bodies[0]!.x = 61; // 5 units past the centre: assist still takes it back
    hold(t, DOWN_STICK, 1);
    expect([t.bodies[0]!.dir, t.bodies[0]!.x]).toEqual([DOWN, 56]);
  });

  it('beyond the assist the turn is NOT taken: a request out of the buffer stops the body and fails at 300 ms', () => {
    const s = solo();
    hold(s, RIGHT_STICK, 4); // along row 0: up is the map edge, blocked everywhere
    const b = s.bodies[0]!;
    hold(s, UP_STICK, 8); // inside the 9-tick buffer: it still runs
    expect(b.dir).toBe(RIGHT);
    hold(s, UP_STICK, 2); // buffer over (150 ms)
    expect(b.dir).toBe(NONE);
    expect(turnReport(s).failed).toBe(0); // not yet 300 ms
    hold(s, UP_STICK, 10);
    const r = turnReport(s);
    expect([r.requested, r.executed, r.failed]).toEqual([2, 1, 1]);
    expect(r.failedRate).toBeCloseTo(0.5, 6);
    hold(s, UP_STICK, 100);
    expect(turnReport(s).failed).toBe(1); // counted once
  });

  it('a request released before 300 ms without running is cancelled, not failed', () => {
    const s = solo();
    hold(s, RIGHT_STICK, 4);
    hold(s, UP_STICK, 5); // up from row 0 is the map edge: blocked
    hold(s, REST, 1);
    expect(turnReport(s)).toMatchObject({
      requested: 2,
      executed: 1,
      failed: 0,
      cancelled: 1,
      open: 0,
    });
  });
});

describe('grid control, plan B (auto-advance)', () => {
  it('the body keeps going after the stick is released, until a wall', () => {
    const s = solo({ control: 'B' });
    hold(s, RIGHT_STICK, 5);
    hold(s, REST, 600);
    const b = s.bodies[0]!;
    expect(b.x).toBe(26 * 16 + 8); // last tile of row 0
    expect(b.dir).toBe(RIGHT);
    hold(s, REST, 10);
    expect(b.x).toBe(26 * 16 + 8);
  });

  it('pushing backwards is a U-turn; pushing forward changes nothing', () => {
    const s = solo({ control: 'B' });
    hold(s, RIGHT_STICK, 30);
    hold(s, RIGHT_STICK, 30);
    expect(turnReport(s).requested).toBe(1);
    hold(s, LEFT_STICK, 1);
    expect(s.bodies[0]!.dir).toBe(2);
  });

  it('a turn asked near a junction uses the same buffer and assist', () => {
    const s = solo({ control: 'B' });
    hold(s, RIGHT_STICK, 5);
    const b = s.bodies[0]!;
    b.x = 52;
    hold(s, DOWN_STICK, 1);
    expect([b.dir, b.x]).toEqual([DOWN, 56]);
    hold(s, REST, 20);
    expect(b.dir).toBe(DOWN); // keeps going down
    expect(b.y).toBeGreaterThan(8 + 16);
  });
});
