import { describe, expect, it } from 'vitest';
import { RIGHT } from '../../sim';
import { DROP, IDLE, USE, countsAgree, give, owner, put, round, sab, stick, tick } from './sab-drive';

describe('roller: 3 s straight, painting the floor it crosses', () => {
  it('runs along its heading ignoring the stick and paints a line of 11+ tiles, then stops being a roller', () => {
    const s = round();
    put(s, 0, 3, 0);
    put(s, 1, 20, 14);
    s.match.bodies[0]!.face = RIGHT;
    give(s, 0, 'roller');
    tick(s, { 0: USE });
    expect(sab(s).roller[0]).toBeGreaterThan(0);
    tick(s, { 0: stick(0, 1000) }, 179); // the stick asks to go down the whole time
    const y = s.grid.bodies[0]!.y;
    expect(y).toBe(8); // never left row 0
    const line = Array.from({ length: 27 }, (_, x) => owner(s, x, 0)).filter((t) => t === 0).length;
    expect(line).toBeGreaterThanOrEqual(11);
    expect(owner(s, 3, 1)).toBe(-1);
    expect(sab(s).roller[0]).toBe(0);
    tick(s, { 0: stick(0, 1000) }, 30); // steering is back
    expect(s.grid.bodies[0]!.y).toBeGreaterThan(8);
    expect(countsAgree(s)).toBe(true);
  });
  it('without it the same stick paints nothing (the line is the roller)', () => {
    const s = round();
    put(s, 0, 3, 0);
    tick(s, { 0: stick(1000, 0) }, 180);
    expect(s.match.counts[0]).toBe(0);
  });
  it('counter: a wall stops it', () => {
    const s = round();
    put(s, 0, 23, 0);
    s.match.bodies[0]!.face = RIGHT;
    give(s, 0, 'roller');
    tick(s, { 0: USE });
    tick(s, { 0: IDLE }, 120);
    expect(sab(s).roller[0]).toBe(0);
    expect(owner(s, 26, 0)).toBe(0);
  });
  it('counter: a rival blast that reaches it cuts the roller and stains it', () => {
    const s = round();
    put(s, 0, 3, 0);
    put(s, 1, 10, 0);
    s.match.bodies[0]!.face = RIGHT;
    tick(s, { 1: DROP }); // rival pinata on (10, 0): goes off at tick 120 of its fuse
    put(s, 1, 20, 14);
    give(s, 0, 'roller');
    tick(s, { 0: USE });
    tick(s, {}, 125);
    expect(s.match.bodies[0]!.stun).toBeGreaterThan(0);
    expect(sab(s).roller[0]).toBe(0);
  });
});
