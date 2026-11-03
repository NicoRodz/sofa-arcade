import { describe, expect, it } from 'vitest';
import { paintTile } from '../../sim';
import { USE, countsAgree, give, plus, put, tick, wrap, wrapRound } from './wrap-drive';

/** The 9 tiles of the radius-2 diamond around (13, 0) (same board as sponge.test.ts). */
const D2: [number, number][] = [
  ...[11, 12, 13, 14, 15].map((x): [number, number] => [x, 0]),
  ...[12, 13, 14].map((x): [number, number] => [x, 1]),
  [13, 2],
];
const count = (s: ReturnType<typeof wrapRound>, team: number) => s.match.paint.reduce((n, v) => n + (v === team ? 1 : 0), 0);

/** Body 0 (team 0) at (13, 0) with the sponge; team 1 owns `tiles`. */
function soaking(tiles: [number, number][]) {
  const s = wrapRound([0, 1], 5);
  for (const [x, y] of tiles) paintTile(s.match, x, y, 1, 0);
  put(s, 0, 13, 0);
  put(s, 1, 24, 14);
  give(s, 0, 'sponge');
  return s;
}

describe('sponge v2: `soaked` counts distinct tiles, not soak events', () => {
  it('a tile the rival repaints and the sponge takes again counts once: 8 distinct tiles stay radius 2 (9 tiles), not radius 3', () => {
    const s = soaking(D2.slice(1)); // 8 tiles
    tick(s, { 0: USE });
    expect(plus(s).soaked[0]).toBe(8);
    for (let k = 0; k < 3; k++) {
      paintTile(s.match, 12, 0, 1, 0); // the rival repaints the same tile, the sponge takes it again
      tick(s);
      expect(plus(s).soaked[0]).toBe(8);
    }
    expect(wrap(s).taken[0]).toHaveLength(8);
    tick(s, { 0: USE });
    expect(count(s, 0)).toBe(9); // radius 2; counting events (11) would have squeezed radius 3 (14)
    expect(plus(s).soaked[0]).toBe(0);
    expect(wrap(s).taken[0]).toEqual([]);
    expect(wrap(s).log.map((e) => [e.kind, e.n])).toEqual([['squeeze', 8]]);
    expect(countsAgree(s)).toBe(true);
  });
  it('a genuinely new ninth tile still reaches the threshold: 8 tiles, then (11, 0) appears and is soaked = radius 3', () => {
    const s = soaking(D2.slice(1));
    tick(s, { 0: USE });
    paintTile(s.match, 12, 0, 1, 0); // repeat, does not count
    tick(s);
    expect(plus(s).soaked[0]).toBe(8);
    paintTile(s.match, 11, 0, 1, 0); // new tile
    tick(s);
    expect(plus(s).soaked[0]).toBe(9);
    tick(s, { 0: USE });
    expect(count(s, 0)).toBe(14);
  });
  it('a new sponge starts from nothing: what the previous one took is not remembered', () => {
    const s = soaking(D2);
    tick(s, { 0: USE });
    tick(s, { 0: USE }); // squeezed
    give(s, 0, 'sponge');
    for (const [x, y] of D2) paintTile(s.match, x, y, 1, 0);
    tick(s, { 0: USE });
    expect(plus(s).soaked[0]).toBe(9);
  });
});
