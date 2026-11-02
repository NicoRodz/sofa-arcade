import { describe, expect, it } from 'vitest';
import { DROP, USE, give, owner, put, round, sab, stick, tick } from './sab-drive';

describe('glue: the next pinata sticks to the nearest rival and goes off where he is', () => {
  it('sticks to the nearest rival (not a teammate, not the far rival) and follows him', () => {
    const s = round([0, 0, 1, 1]);
    put(s, 0, 5, 0);
    put(s, 1, 6, 0); // teammate, closer than any rival
    put(s, 2, 9, 0); // nearest rival (4 tiles)
    put(s, 3, 5, 6); // rival at 6 tiles
    give(s, 0, 'glue');
    tick(s, { 0: USE });
    tick(s, { 0: DROP });
    const p = s.match.pinatas[0]!;
    expect([p.mod, p.stuck, p.x, p.y]).toEqual(['glue', 2, 9, 0]);
    expect(sab(s).armed[0]).toBeNull();
    tick(s, { 2: stick(1000, 0) }, 40); // he runs: the pinata goes with him
    expect(p.x).toBe(Math.floor(s.grid.bodies[2]!.x / 16));
    expect(p.x).toBeGreaterThan(9);
    const at = p.x;
    tick(s, { 2: stick(1000, 0) }, 90); // fuse out: it goes off on his tile at that moment
    expect(s.match.pinatas.length).toBe(0);
    expect(s.match.bodies[2]!.stun).toBeGreaterThan(0);
    expect(owner(s, Math.floor(s.grid.bodies[2]!.x / 16), 0)).toBe(0);
    expect(at).toBeLessThan(Math.floor(s.grid.bodies[2]!.x / 16) + 1);
    expect(owner(s, 5, 0)).toBe(-1); // nothing painted where the sabotage owner stands
  });
  it('counter: no rival within 6 tiles, it drops as a plain pinata and the glue stays armed', () => {
    const s = round();
    put(s, 0, 3, 0);
    put(s, 1, 20, 14);
    give(s, 0, 'glue');
    tick(s, { 0: USE });
    tick(s, { 0: DROP });
    const p = s.match.pinatas[0]!;
    expect([p.x, p.y, p.stuck, p.mod]).toEqual([3, 0, undefined, undefined]);
    expect(sab(s).armed[0]).toBe('glue');
  });
  it('counter: the blast is cut by furniture (a diamond that Manhattan would reach is not)', () => {
    const s = round();
    put(s, 0, 8, 3);
    put(s, 1, 9, 2); // F0: (8, 2) is furniture, so (7, 2) is 2 tiles away as the crow flies but 4 by floor
    give(s, 0, 'glue');
    tick(s, { 0: USE });
    tick(s, { 0: DROP });
    put(s, 0, 20, 14);
    tick(s, {}, 125);
    expect(owner(s, 9, 0)).toBe(0);
    expect(owner(s, 7, 2)).toBe(-1);
  });
});
