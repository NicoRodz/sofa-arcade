import { describe, expect, it } from 'vitest';
import { paintTile } from '../../sim';
import { DROP, USE, blastAt, countsAgree, face, give, owner, put, stick, tick, wrap, wrapRound, taped, plus } from './wrap-drive';

/** Body 0 (team 0) at (1, 7) heading right with the tape: the line lands on column 3, rows 5 to 9. Body 1 is far away. */
function setup() {
  const s = wrapRound([0, 1]);
  put(s, 0, 1, 7);
  face(s, 0, 0);
  put(s, 1, 24, 14);
  give(s, 0, 'tape');
  return s;
}
const COL3 = [5, 6, 7, 8, 9].map((y) => `3,${y}`);

describe('packing tape: a 5-tile line across your heading, 2 tiles ahead, 12 ticks after B, for 360 ticks', () => {
  it('lands on the 12th tick (not the 11th), perpendicular to the heading, centred 2 tiles ahead; the card is spent at the press', () => {
    const s = setup();
    tick(s, { 0: USE }, 11);
    expect(wrap(s).strips).toEqual([]);
    expect(wrap(s).prep[0]).toBe(1);
    expect(s.match.sab!.held[0]).toBeNull();
    tick(s);
    expect(taped(s)).toEqual(COL3);
    expect(wrap(s).strips[0]).toMatchObject({ owner: 0, team: 0, left: 360 });
    expect(plus(s).tapes).toEqual([]); // the F8a 3x3 is not used
    expect(wrap(s).log.map((e) => e.kind)).toEqual(['tape']);
  });
  it('heading down it is a left-right line, and the walls are skipped (the line has no hole-filling)', () => {
    const s = wrapRound([0, 1]);
    put(s, 0, 4, 2);
    face(s, 0, 1);
    put(s, 1, 24, 14);
    give(s, 0, 'tape');
    tick(s, { 0: USE }, 12);
    expect(taped(s)).toEqual(['3,4', '4,4', '5,4']); // (2,4) and (6,4) are furniture
  });
  it('wears off after exactly 360 ticks', () => {
    const s = setup();
    tick(s, { 0: USE }, 12);
    tick(s, {}, 359);
    expect(wrap(s).strips).toHaveLength(1);
    tick(s);
    expect(wrap(s).strips).toEqual([]);
  });
  it('cuts a blast like a wall, for the other team and for its own: the far side is not painted', () => {
    const s = setup();
    tick(s, { 0: USE }, 12);
    blastAt(s, 5, 7, 1, 1); // rival diamond of radius 2: (3..5, 7) and more without the tape ((6, 7) is furniture)
    tick(s);
    expect([4, 5].map((x) => owner(s, x, 7))).toEqual([1, 1]);
    expect([3, 2].map((x) => owner(s, x, 7))).toEqual([-1, -1]);
    blastAt(s, 5, 6, 0, 0); // its own diamond is cut too
    tick(s);
    expect([3, 2].map((x) => owner(s, x, 6))).toEqual([-1, -1]);
    expect(countsAgree(s)).toBe(true);
  });
  it('the floor under it stays as it is: neutral stays neutral and a rival tile cannot be repainted, even by a blast that starts on it (which paints only off the tape)', () => {
    const s = setup();
    paintTile(s.match, 3, 6, 1, 0);
    tick(s, { 0: USE }, 12);
    blastAt(s, 3, 7, 0, 0); // on the tape: the tape tiles are refused, the tiles off it are painted
    tick(s);
    expect([owner(s, 3, 7), owner(s, 3, 6), owner(s, 3, 8)]).toEqual([-1, 1, -1]);
    expect([owner(s, 2, 7), owner(s, 4, 7)]).toEqual([0, 0]);
    expect(countsAgree(s)).toBe(true);
  });
  it('a body walks over it (a rival too): it never shuts anyone in', () => {
    const s = setup();
    tick(s, { 0: USE }, 12);
    put(s, 1, 2, 7);
    tick(s, { 1: stick(1000, 0) }, 40);
    expect(s.grid.bodies[1]!.x).toBeGreaterThan(5 * 16);
  });
  it('a body standing on it is not stained by a blast from outside (it is a wall to the blast)', () => {
    const s = setup();
    tick(s, { 0: USE }, 12);
    put(s, 1, 3, 7);
    blastAt(s, 5, 7, 0, 0);
    tick(s);
    expect(s.match.bodies[1]!.stun).toBe(0);
  });
  it('one per body: a second tape takes the first away', () => {
    const s = setup();
    tick(s, { 0: USE }, 12);
    put(s, 0, 8, 0);
    face(s, 0, 0);
    give(s, 0, 'tape');
    tick(s, { 0: USE }, 12);
    expect(wrap(s).strips).toHaveLength(1);
    expect(taped(s)).toEqual(['10,0', '10,1']); // (10, 2) is furniture
  });
  it('a stain during the wind-up cuts it: no tape lands', () => {
    const s = setup();
    tick(s, { 0: USE }, 4);
    blastAt(s, 1, 7, 1, 1);
    tick(s);
    expect(s.match.bodies[0]!.stun).toBeGreaterThan(0);
    tick(s, {}, 30);
    expect(wrap(s).strips).toEqual([]);
    expect(wrap(s).log).toEqual([]);
  });
  it('team 1 puts the mirror image: heading left, column 23', () => {
    const s = wrapRound([0, 1]);
    put(s, 1, 25, 7);
    face(s, 1, 2);
    put(s, 0, 2, 14);
    give(s, 1, 'tape');
    tick(s, { 1: USE }, 12);
    expect(taped(s)).toEqual([5, 6, 7, 8, 9].map((y) => `23,${y}`));
    expect(wrap(s).strips[0]!.team).toBe(1);
  });
  it('the drop button still works while the tape winds up', () => {
    const s = setup();
    tick(s, { 0: USE });
    tick(s, { 0: DROP });
    expect(s.match.pinatas).toHaveLength(1);
  });
});
