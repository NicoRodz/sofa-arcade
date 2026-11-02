import { describe, expect, it } from 'vitest';
import { USE, give, owner, put, round, sab, stick, tick } from './sab-drive';

describe('footprints: for 5 s the moving rivals paint your colour', () => {
  it('paints where the rival walks, in the sabotage owner colour, for exactly 300 ticks', () => {
    const s = round();
    put(s, 1, 26, 0);
    put(s, 0, 2, 14);
    give(s, 0, 'footprints');
    tick(s, { 0: USE });
    expect(sab(s).footprints).toEqual([0, 299]); // team 1 (the rivals) leave the footprints; this tick already counted
    tick(s, { 1: stick(-1000, 0) }, 60);
    const mine = Array.from({ length: 27 }, (_, x) => owner(s, x, 0)).filter((t) => t === 0).length;
    expect(mine).toBeGreaterThanOrEqual(3);
    expect(s.match.counts[1]).toBe(0);
    tick(s, { 1: stick(-1000, 0) }, 239); // 300 ticks in all: the last footprint
    expect(sab(s).footprints[1]).toBe(0);
    const painted = s.match.counts[0]!;
    tick(s, { 1: stick(-1000, 0) }, 40); // still walking, nothing more is painted
    expect(s.match.counts[0]).toBe(painted);
  });
  it('the sabotage owner team leaves no footprints of its own', () => {
    const s = round();
    put(s, 0, 2, 14);
    give(s, 0, 'footprints');
    tick(s, { 0: USE });
    tick(s, { 0: stick(1000, 0) }, 60);
    expect(s.match.counts).toEqual([0, 0]);
  });
  it('counter: a rival standing still paints nothing', () => {
    const s = round();
    put(s, 1, 13, 0);
    put(s, 0, 2, 14);
    give(s, 0, 'footprints');
    tick(s, { 0: USE });
    tick(s, {}, 300);
    expect(s.match.counts).toEqual([0, 0]);
  });
  it('counter: the rival blast repaints the footprints', () => {
    const s = round();
    put(s, 1, 14, 0);
    put(s, 0, 2, 14);
    give(s, 0, 'footprints');
    tick(s, { 0: USE });
    tick(s, { 1: stick(-1000, 0) }, 40);
    const x = Math.floor(s.grid.bodies[1]!.x / 16);
    expect(owner(s, x, 0)).toBe(0);
    s.match.pinatas.push({ id: 90, x, y: 0, team: 1, owner: 1, fuse: 1, radius: 2 });
    tick(s, { 1: stick(0, 0) });
    expect(owner(s, x, 0)).toBe(1);
  });
});
