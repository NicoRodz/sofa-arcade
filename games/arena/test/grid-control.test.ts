import { describe, expect, it } from 'vitest';
import { emptyMap } from '../map';
import { DOWN, NONE, RIGHT, turnReport } from '../sim';
import { DOWN_STICK, LEFT_STICK, REST, RIGHT_STICK, UP_STICK, hold, solo, stick } from './grid-drive';

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
    hold(s, REST, 5); // 66 ms of grace: a thumb dip is not a release
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

  it('corner assist: within 0.4 tile of a lane centre the body slides onto it without stopping, and turns on arrival', () => {
    const s = solo();
    hold(s, RIGHT_STICK, 5);
    const b = s.bodies[0]!;
    b.x = 52; // 4 units before centre 56
    hold(s, DOWN_STICK, 1);
    expect([b.dir, b.moved]).toEqual([RIGHT, true]); // still sliding along, not stopped
    hold(s, DOWN_STICK, 5);
    expect([b.dir, b.x]).toEqual([DOWN, 56]);
    const t = solo();
    hold(t, RIGHT_STICK, 5);
    const c = t.bodies[0]!;
    c.x = 62; // 6 units past the centre: inside the 6-unit assist, it slides back to it
    hold(t, DOWN_STICK, 1);
    expect(c.x).toBeLessThan(62);
    expect(c.moved).toBe(true);
    hold(t, DOWN_STICK, 8);
    expect([c.dir, c.x]).toEqual([DOWN, 56]);
    const u = solo();
    hold(u, RIGHT_STICK, 5);
    u.bodies[0]!.x = 63; // 7 past: outside the assist, this lane is gone, the body goes on to the next one
    hold(u, DOWN_STICK, 2);
    expect([u.bodies[0]!.dir, u.bodies[0]!.x > 63]).toEqual([RIGHT, true]);
  });

  it('turn buffer: a tap of 1 tick asked 12 units before the lane still turns there (180 ms)', () => {
    const s = solo({ control: 'B' });
    hold(s, RIGHT_STICK, 5);
    const b = s.bodies[0]!;
    b.x = 44; // 12 units before centre 56: outside the assist, so the tap must be kept
    hold(s, DOWN_STICK, 1);
    expect(b.dir).toBe(RIGHT);
    hold(s, REST, 20);
    expect([b.dir, b.x]).toEqual([DOWN, 56]);
    expect(turnReport(s)).toMatchObject({ failed: 0, executed: 2 });
    const t = solo({ control: 'B' });
    hold(t, RIGHT_STICK, 5);
    t.bodies[0]!.x = 24; // 32 units before the lane: past the 180 ms the tap is gone
    hold(t, DOWN_STICK, 1);
    hold(t, REST, 40);
    expect(t.bodies[0]!.dir).toBe(RIGHT);
    expect(turnReport(t)).toMatchObject({ cancelled: 1, open: 0 });
  });

  it('diagonal: against a wall the body takes the free axis (it never stands while the other axis serves)', () => {
    const s = solo(); // spawn on row 0: up is the map edge, right is free
    hold(s, stick(300, -900), 20);
    const b = s.bodies[0]!;
    expect([b.dir, b.x > 8, b.y]).toEqual([RIGHT, true, 8]);
    const t = solo();
    hold(t, RIGHT_STICK, 5);
    t.bodies[0]!.x = 56; // tile 3: down and right are both free: the stronger axis wins
    hold(t, stick(500, 900), 3);
    expect(t.bodies[0]!.dir).toBe(DOWN);
    const u = solo();
    hold(u, RIGHT_STICK, 5);
    u.bodies[0]!.x = 56;
    hold(u, stick(900, 500), 3);
    expect(u.bodies[0]!.dir).toBe(RIGHT);
  });

  it('never stands: the stick against a wall with no lane keeps the body running along its corridor, and the unmet turn fails once at 300 ms', () => {
    const s = solo();
    hold(s, RIGHT_STICK, 4); // along row 0: up is the map edge, blocked everywhere
    const b = s.bodies[0]!;
    hold(s, UP_STICK, 60);
    expect([b.dir, b.moved]).toEqual([RIGHT, true]);
    const r = turnReport(s);
    expect([r.requested, r.executed, r.failed]).toEqual([2, 1, 1]);
    hold(s, UP_STICK, 100);
    expect(turnReport(s).failed).toBe(1); // counted once
  });

  it('a body at rest, misaligned by more than the assist, slides to the lane centre and goes (it does not stay stuck)', () => {
    const s = solo();
    hold(s, RIGHT_STICK, 5);
    hold(s, REST, 6);
    const b = s.bodies[0]!;
    expect(b.dir).toBe(NONE);
    b.x = 49; // 7 before centre 56, standing
    hold(s, DOWN_STICK, 12);
    expect([b.dir, b.x]).toEqual([DOWN, 56]);
    expect(b.y).toBeGreaterThan(8);
  });

  it('a body exactly between two lane centres picks the side the stick leans to (mirror-safe), or the way it was heading', () => {
    const s = solo({ map: emptyMap([[[1, 1]], [[2, 1]]]) });
    const b = s.bodies[0]!;
    [b.x, b.y, b.last] = [160, 24, DOWN]; // on the edge between tiles 9 and 10, last heading across the lane axis
    hold(s, stick(300, 900), 4);
    expect(b.x).toBeGreaterThan(160);
    const t = solo({ map: emptyMap([[[1, 1]], [[2, 1]]]) });
    const c = t.bodies[0]!;
    [c.x, c.y, c.last] = [160, 24, DOWN];
    hold(t, stick(-300, 900), 4);
    expect(c.x).toBeLessThan(160);
  });

  it('plan A release grace: a 3-tick dip into the dead zone does not stop the body, 4 ticks do', () => {
    const s = solo();
    hold(s, RIGHT_STICK, 20);
    const b = s.bodies[0]!;
    hold(s, REST, 3);
    expect([b.dir, b.moved]).toEqual([RIGHT, true]);
    hold(s, RIGHT_STICK, 1);
    expect(b.dir).toBe(RIGHT);
    hold(s, REST, 4);
    expect(b.dir).toBe(NONE);
  });

  it('a request released before 300 ms without running is cancelled, not failed', () => {
    const s = solo();
    hold(s, RIGHT_STICK, 4);
    hold(s, UP_STICK, 5); // up from row 0 is the map edge: blocked
    hold(s, REST, 5); // released (66 ms grace): the buffered turn goes with it
    expect(turnReport(s)).toMatchObject({
      requested: 2,
      executed: 1,
      failed: 0,
      cancelled: 1,
      open: 0,
    });
  });

  it('a request already failed (300 ms) and then released stays failed: it is not also counted as cancelled', () => {
    const s = solo();
    hold(s, RIGHT_STICK, 4);
    hold(s, UP_STICK, 30); // blocked by the map edge for more than 300 ms
    hold(s, REST, 1);
    expect(turnReport(s)).toMatchObject({ requested: 2, executed: 1, failed: 1, cancelled: 0, open: 0 });
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
    hold(s, DOWN_STICK, 5);
    expect([b.dir, b.x]).toEqual([DOWN, 56]);
    hold(s, REST, 20);
    expect(b.dir).toBe(DOWN); // keeps going down
    expect(b.y).toBeGreaterThan(8 + 16);
  });
});
