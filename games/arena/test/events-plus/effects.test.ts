import { describe, expect, it } from 'vitest';
import { mirrorTile } from '../../map';
import { BALLOON_WARN_TICKS, CONTAGION_WARN_TICKS, HAPPY_TICKS, blastTiles, type ManchazoState } from '../../sim';
import { paintTile } from '../../sim/match/board';
import { DROP, put, tileOwner } from '../match-drive';
import { onlyPlus, plusRound, run } from './plus-drive';

const paintAt = (s: ManchazoState, team: number, tiles: readonly (readonly [number, number])[]) =>
  tiles.forEach(([x, y]) => paintTile(s.match, x, y, team, 0));
const ev = (s: ManchazoState) => s.match.ev!;
/** A tile that radius 3 reaches from (13, 7) and radius 2 does not. */
const rim = (s: ManchazoState) => {
  const two = new Set(blastTiles(13, 7, 2, s.grid.map).map((t) => t.join(',')));
  return blastTiles(13, 7, 3, s.grid.map).find((t) => !two.has(t.join(',')) && Math.abs(t[0] - 13) + Math.abs(t[1] - 7) === 3)!;
};

describe('Contagio', () => {
  // (13,7) and its neighbours are open floor on the F0 map
  const setup = () => {
    const s = onlyPlus(plusRound(), 'contagion', 10);
    paintAt(s, 0, [
      [13, 7],
      [13, 8],
    ]);
    paintAt(s, 1, [
      [12, 7],
      [14, 7],
      [13, 6],
      [12, 8],
      [14, 8],
    ]);
    return s;
  };
  it('is announced, waits 3 s, then turns every painted tile with 3 or more rival neighbours, in ONE pass (no cascade)', () => {
    const s = setup();
    run(s, 11);
    expect(ev(s).log.map((a) => a.kind)).toEqual(['contagion']);
    run(s, CONTAGION_WARN_TICKS - 2);
    expect(tileOwner(s, 13, 7)).toBe(0); // still warning
    run(s, 2);
    expect(tileOwner(s, 13, 7)).toBe(1); // 3 rivals (12,7), (14,7), (13,6): turned
    expect(tileOwner(s, 13, 8)).toBe(0); // 2 rivals on the original board ((12,8), (14,8)); it would have 3 if the pass saw (13,7) already turned
    expect(s.match.counts).toEqual([1, 6]);
    expect(ev(s).plus!.contagion!.flipped).toBe(1);
    expect(ev(s).plus!.fx).toBe(1);
    run(s, 120);
    expect(ev(s).active).toBeNull(); // it is over after the 1 s of result
    expect(ev(s).plus!.contagion).toBeNull();
  });
  it('a compact block resists: a tile with only 2 rival neighbours keeps its colour', () => {
    const s = onlyPlus(plusRound(), 'contagion', 10);
    paintAt(s, 0, [[13, 7]]);
    paintAt(s, 1, [
      [12, 7],
      [14, 7],
    ]);
    run(s, 10 + CONTAGION_WARN_TICKS + 2);
    expect(tileOwner(s, 13, 7)).toBe(0);
    expect(ev(s).plus!.contagion!.flipped).toBe(0);
  });
  it('is not played when a team trails by more than 15 %: the slot is spent and nothing is announced', () => {
    const s = setup();
    for (let x = 0; x < 27; x++) for (let y = 0; y < 15; y++) if (y !== 7 || x < 11 || x > 15) paintTile(s.match, x, y, 1, 0);
    expect(Math.abs(s.match.counts[0]! - s.match.counts[1]!) * 100).toBeGreaterThan(15 * s.match.paintable);
    run(s, 400);
    expect(ev(s).log.map((a) => a.kind)).not.toContain('contagion');
    expect(ev(s).next).toBe(1);
    expect(ev(s).active).toBeNull();
  });
});

describe('Hora feliz', () => {
  it('lasts 8 s; a pinata reaches one tile further (radius 3 instead of 2) and the per-player cap of 2 is lifted', () => {
    const s = onlyPlus(plusRound(), 'happyHour', 5);
    run(s, 6);
    expect(ev(s).active?.kind).toBe('happyHour');
    for (const [x, y] of [
      [13, 7],
      [13, 9],
      [13, 11],
    ] as const) {
      put(s, 0, x, y);
      run(s, 1, { 0: DROP });
    }
    expect(s.match.pinatas.filter((p) => p.owner === 0)).toHaveLength(3); // without the event the third one would be refused (no reserve on even teams)
    run(s, 200);
    expect(s.match.pinatas).toHaveLength(0);
    expect(tileOwner(s, 13, 7)).toBe(0);
    const [ex, ey] = rim(s);
    expect(tileOwner(s, ex, ey)).toBe(0); // one tile past the usual radius 2
    expect(s.match.counts[0]).toBeGreaterThan(blastTiles(13, 7, 2, s.grid.map).length * 2);
    run(s, HAPPY_TICKS);
    expect(ev(s).active).toBeNull();
  });
  it('outside the event the same drops are capped and reach radius 2', () => {
    const s = plusRound();
    s.match.ev!.program = [];
    for (const [x, y] of [
      [13, 7],
      [13, 9],
      [13, 11],
    ] as const) {
      put(s, 0, x, y);
      run(s, 1, { 0: DROP });
    }
    expect(s.match.pinatas.filter((p) => p.owner === 0)).toHaveLength(2);
    run(s, 200);
    const [ex, ey] = rim(s);
    expect(tileOwner(s, ex, ey)).toBe(-1);
  });
});

describe('Globos en disputa', () => {
  const spot = (s: ManchazoState) => ev(s).plus!.balloons[0]!;
  it('3 mirrored pairs, a shadow for 3 s, then each paints a 3x3 for the team with more bodies within 2 tiles; a tie or nobody lands neutral', () => {
    const s = onlyPlus(plusRound(3, [0, 1, 0, 1]), 'balloons', 10);
    expect(ev(s).plus!.balloons).toHaveLength(3);
    const [bx, by] = spot(s);
    const [mx, my] = mirrorTile([bx, by]);
    const ring = ev(s).plus!.balloons[1]!;
    paintAt(s, 1, [
      [ring[0], ring[1]],
      [ring[0] + 1, ring[1]],
    ]); // a balloon with nobody around erases what it falls on
    put(s, 0, bx, by);
    put(s, 2, bx + 1, by);
    put(s, 1, mx, my);
    put(s, 3, 13, 14);
    run(s, 10 + BALLOON_WARN_TICKS - 1);
    expect(ev(s).plus!.balloon!.owner.every((o) => o === -2)).toBe(true); // 1 tick before: still the shadow
    run(s, 2);
    const owner = ev(s).plus!.balloon!.owner;
    expect(owner[0]).toBe(0); // two team-0 bodies against none
    expect(owner[1]).toBe(1); // its mirror image: only team 1
    expect(owner[2]).toBe(-1); // nobody around the second balloon
    expect(tileOwner(s, bx, by)).toBe(0);
    expect(tileOwner(s, mx, my)).toBe(1);
    expect(tileOwner(s, ring[0], ring[1])).toBe(-1);
    expect(s.match.counts[0]! + s.match.counts[1]!).toBe(s.match.paint.reduce((n, v) => n + (v >= 0 ? 1 : 0), 0));
  });
  it('a tie lands neutral', () => {
    const s = onlyPlus(plusRound(3, [0, 1]), 'balloons', 10);
    const [bx, by] = spot(s);
    paintAt(s, 0, [[bx, by]]);
    put(s, 0, bx, by);
    put(s, 1, bx, by);
    run(s, 10 + BALLOON_WARN_TICKS + 2);
    expect(ev(s).plus!.balloon!.owner[0]).toBe(-1);
    expect(tileOwner(s, bx, by)).toBe(-1);
  });
});
