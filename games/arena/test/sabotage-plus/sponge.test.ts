import { describe, expect, it } from 'vitest';
import { paintTile } from '../../sim';
import { USE, countsAgree, give, owner, plus, plusRound, put, sab, tick } from './plus-drive';

/** Team 1 owns the 3x3 around (cx, cy) except the tiles in `skip`; body 0 (team 0) stands in the middle with the sponge. */
function soaked(cx = 10, cy = 1, skip: [number, number][] = []) {
  const s = plusRound([0, 1]);
  for (let y = cy - 1; y <= cy + 1; y++)
    for (let x = cx - 1; x <= cx + 1; x++)
      if (!skip.some(([a, b]) => a === x && b === y) && s.grid.map.solid[y * 27 + x] === 0) paintTile(s.match, x, y, 1, 0);
  put(s, 0, cx, cy);
  put(s, 1, 22, 14);
  give(s, 0, 'sponge');
  return s;
}

describe('sponge: first B absorbs rival paint in the 3x3, second B (within 5 s) squeezes it out in a spiral as your own', () => {
  it('the first press leaves the rival tiles neutral, keeps the card and holds what it took', () => {
    const s = soaked(15, 5);
    const before = s.match.counts[1]!;
    expect(before).toBe(9);
    tick(s, { 0: USE });
    expect(s.match.counts[1]).toBe(0);
    expect(s.match.counts[0]).toBe(0); // absorbing is not painting
    expect(plus(s).soaked[0]).toBe(9);
    expect(plus(s).sponge[0]).toBe(300 - 1);
    expect(sab(s).held[0]).toBe('sponge'); // still in hand: the second B squeezes
    expect(countsAgree(s)).toBe(true);
  });
  it('the second press paints as many tiles as it took, in a clockwise spiral from your tile, and empties the hand', () => {
    const s = soaked(15, 5, [[14, 4], [15, 4]]); // 7 rival tiles around (15, 5)
    tick(s, { 0: USE });
    expect(plus(s).soaked[0]).toBe(7);
    tick(s, {}, 100);
    tick(s, { 0: USE });
    const mine = [] as string[];
    s.match.paint.forEach((v, i) => v === 0 && mine.push(`${i % 27},${Math.floor(i / 27)}`));
    // centre, right, down-right, down, down-left, left, up-left
    expect(mine.sort()).toEqual(['15,5', '16,5', '16,6', '15,6', '14,6', '14,5', '14,4'].sort());
    expect(sab(s).held[0]).toBeNull();
    expect(plus(s).sponge[0]).toBe(0);
    expect(countsAgree(s)).toBe(true);
  });
  it('team 1 squeezes the mirror image', () => {
    const s = plusRound([0, 1]);
    for (const [x, y] of [[14, 5], [15, 5], [16, 5]] as const) paintTile(s.match, x, y, 0, 0);
    put(s, 1, 15, 5);
    put(s, 0, 2, 14);
    give(s, 1, 'sponge');
    tick(s, { 1: USE });
    expect(plus(s).soaked[1]).toBe(3);
    tick(s, { 1: USE });
    const mine = [] as string[];
    s.match.paint.forEach((v, i) => v === 1 && mine.push(`${i % 27},${Math.floor(i / 27)}`));
    expect(mine.sort()).toEqual(['14,5', '14,6', '15,5'].sort()); // centre, left, down-left
  });
  it('counter: not squeezed within 5 s, it is lost; the absorbed paint stays neutral', () => {
    const s = soaked();
    tick(s, { 0: USE });
    tick(s, {}, 300);
    expect(sab(s).held[0]).toBeNull();
    expect(plus(s).soaked[0]).toBe(0);
    tick(s, { 0: USE });
    expect(s.match.counts).toEqual([0, 0]);
  });
  it('counter: with no rival paint in the 3x3 nothing happens and the card is not spent', () => {
    const s = soaked(10, 1, [[9, 0], [10, 0], [11, 0], [9, 1], [10, 1], [11, 1], [9, 2], [10, 2], [11, 2]]);
    tick(s, { 0: USE });
    expect(sab(s).held[0]).toBe('sponge');
    expect(plus(s).sponge[0]).toBe(0);
    expect(sab(s).used).toBe(0);
  });
  it('counter: a tape of the rival over the paint keeps it from being absorbed', () => {
    const s = soaked(15, 5);
    plus(s).tapes.push({ x: 15, y: 5, team: 1, left: 100 });
    tick(s, { 0: USE });
    expect(s.match.counts[1]).toBe(9);
    expect(sab(s).held[0]).toBe('sponge');
  });
});
