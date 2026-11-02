import { describe, expect, it } from 'vitest';
import { paintTile } from '../../sim';
import { DROP, USE, countsAgree, give, owner, plus, plusRound, put, tick } from './plus-drive';

/** Team 0 owns (9..13, 0), body 0 stands on (10, 0) with the tape; body 1 (team 1) goes to `rx` on row 0 and drops a pinata there. */
function setup(rx = 12) {
  const s = plusRound([0, 1]);
  for (let x = 9; x <= 13; x++) paintTile(s.match, x, 0, 0, 0);
  put(s, 0, 10, 0);
  give(s, 0, 'tape');
  put(s, 1, rx, 0);
  return s;
}
const rivalBlast = (s: ReturnType<typeof setup>) => {
  tick(s, { 1: DROP });
  put(s, 1, 24, 14);
  tick(s, {}, 125); // the fuse is 2 s
};

describe('tape: for 6 s nobody repaints or erases your paint in the 3x3 where you put it', () => {
  it('puts a 3x3 of the caster team on its tile for 6 s and spends the card', () => {
    const s = setup();
    tick(s, { 0: USE });
    expect(plus(s).tapes).toEqual([{ x: 10, y: 0, team: 0, left: 360 - 1 }]);
    expect(s.match.sab!.held[0]).toBeNull();
  });
  it('a rival blast over it paints around but does not take the covered tiles of your colour', () => {
    const s = setup();
    tick(s, { 0: USE });
    rivalBlast(s); // diamond of radius 2 around (12, 0): (10..14, 0), (11..13, 1) ...
    expect([10, 11].map((x) => owner(s, x, 0))).toEqual([0, 0]); // inside the tape: kept
    expect([12, 13, 14].map((x) => owner(s, x, 0))).toEqual([1, 1, 1]); // outside it: lost, as always
    expect(owner(s, 11, 1)).toBe(1); // covered but neutral: the tape guards paint, not the floor
    expect(countsAgree(s)).toBe(true);
  });
  it('the aguarras (erasing) does not take them either; the paint around the tape goes neutral', () => {
    const s = setup();
    tick(s, { 0: USE });
    give(s, 1, 'turpentine');
    tick(s, { 1: USE });
    rivalBlast(s);
    expect([10, 11].map((x) => owner(s, x, 0))).toEqual([0, 0]);
    expect([12, 13].map((x) => owner(s, x, 0))).toEqual([-1, -1]);
    expect(countsAgree(s)).toBe(true);
  });
  it('wears off after 6 s: then the same blast takes the tiles', () => {
    const s = setup();
    tick(s, { 0: USE });
    tick(s, {}, 360);
    expect(plus(s).tapes).toEqual([]);
    rivalBlast(s);
    expect([10, 11, 12].map((x) => owner(s, x, 0))).toEqual([1, 1, 1]);
  });
  it('is the same from the other team: the mirror image keeps the other colour', () => {
    const s = plusRound([0, 1]);
    for (let x = 13; x <= 17; x++) paintTile(s.match, x, 0, 1, 0);
    put(s, 1, 16, 0);
    give(s, 1, 'tape');
    put(s, 0, 14, 0);
    tick(s, { 1: USE });
    tick(s, { 0: DROP });
    put(s, 0, 2, 14);
    tick(s, {}, 125);
    expect([15, 16].map((x) => owner(s, x, 0))).toEqual([1, 1]);
    expect([14, 13].map((x) => owner(s, x, 0))).toEqual([0, 0]);
  });
});
