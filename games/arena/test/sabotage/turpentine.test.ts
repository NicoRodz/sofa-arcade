import { describe, expect, it } from 'vitest';
import { paintTile } from '../../sim/match/board';
import { blastTiles } from '../../sim';
import { DROP, USE, countsAgree, give, owner, put, round, sab, tick } from './sab-drive';

/** Body 0 (team 0) on (10, 0) with turpentine; the floor around is rival paint (team 1), plus one of its own tiles. */
function setup() {
  const s = round();
  put(s, 0, 10, 0);
  put(s, 1, 20, 14);
  for (let x = 4; x <= 16; x++) for (let y = 0; y <= 1; y++) paintTile(s.match, x, y, 1, 0);
  paintTile(s.match, 11, 0, 0, 0); // its own paint inside the diamond
  return s;
}

describe('turpentine: the stain erases rival paint instead of painting', () => {
  it('the diamond goes neutral where it was the rival, its own paint stays, nothing is painted', () => {
    const s = setup();
    const diamond = blastTiles(10, 0, 2, s.grid.map);
    const before = diamond.map(([x, y]) => owner(s, x, y));
    give(s, 0, 'turpentine');
    tick(s, { 0: USE });
    expect(sab(s).armed[0]).toBe('turpentine');
    tick(s, { 0: DROP });
    expect(s.match.pinatas[0]!.mod).toBe('turpentine');
    expect(sab(s).armed[0]).toBeNull();
    tick(s, {}, 125);
    expect(s.match.pinatas.length).toBe(0);
    diamond.forEach(([x, y], k) => expect(owner(s, x, y)).toBe(before[k] === 0 ? 0 : -1));
    expect(owner(s, 15, 0)).toBe(1); // outside the diamond: untouched
    expect(s.match.counts[0]).toBe(1); // it painted nothing
    expect(countsAgree(s)).toBe(true);
  });
  it('a plain pinata after it paints as always (the mark is spent)', () => {
    const s = setup();
    give(s, 0, 'turpentine');
    tick(s, { 0: USE });
    tick(s, { 0: DROP });
    put(s, 0, 6, 0);
    tick(s, { 0: DROP });
    expect(s.match.pinatas[1]!.mod).toBeUndefined();
  });
  it('counter: the erased floor is neutral, so a rival pinata repaints it', () => {
    const s = setup();
    give(s, 0, 'turpentine');
    tick(s, { 0: USE });
    tick(s, { 0: DROP });
    tick(s, {}, 125);
    expect(owner(s, 9, 0)).toBe(-1);
    put(s, 1, 9, 0);
    tick(s, { 1: DROP });
    tick(s, {}, 125);
    expect(owner(s, 9, 0)).toBe(1);
    expect(countsAgree(s)).toBe(true);
  });
  it('it still stains a rival standing in it (and is seen as marked to the TV: mod set for 2 s)', () => {
    const s = setup();
    put(s, 1, 9, 0);
    give(s, 0, 'turpentine');
    tick(s, { 0: USE });
    tick(s, { 0: DROP });
    tick(s, {}, 125);
    expect(s.match.bodies[1]!.stun).toBeGreaterThan(0);
  });
});
