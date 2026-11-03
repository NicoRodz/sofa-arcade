import { describe, expect, it } from 'vitest';
import { paintTile } from '../../sim';
import { USE, blastAt, countsAgree, give, owner, plus, put, sab, tick, wrap, wrapRound } from './wrap-drive';

/** The 9 tiles of the radius-2 diamond around (13, 0) (row 0 is open, (12, 2) and (14, 2) are furniture): 11..15 on row 0, 12..14 on row 1 and (13, 2). */
const D2: [number, number][] = [
  ...[11, 12, 13, 14, 15].map((x): [number, number] => [x, 0]),
  ...[12, 13, 14].map((x): [number, number] => [x, 1]),
  [13, 2],
];
const count = (s: ReturnType<typeof wrapRound>, team: number) => s.match.paint.reduce((n, v) => n + (v === team ? 1 : 0), 0);

/** Body 0 (team 0) at (13, 0) with the sponge; team 1 owns `tiles`. */
function soaking(tiles: [number, number][] = D2, extra = {}) {
  const s = wrapRound([0, 1], 5, extra);
  for (const [x, y] of tiles) paintTile(s.match, x, y, 1, 0);
  put(s, 0, 13, 0);
  put(s, 1, 24, 14);
  give(s, 0, 'sponge');
  return s;
}

describe('sponge v2: B soaks rival paint around you for 60 ticks, the next B (or the clock) squeezes it out as a diamond', () => {
  it('the press makes the rival tiles of the radius-2 diamond neutral at once, counts them and keeps the card', () => {
    const s = soaking();
    tick(s, { 0: USE });
    expect(count(s, 1)).toBe(0);
    expect(count(s, 0)).toBe(0); // soaking is not painting
    expect(plus(s).soaked[0]).toBe(9);
    expect(sab(s).held[0]).toBe('sponge');
    expect(wrap(s).soak[0]).toBe(59);
    expect(countsAgree(s)).toBe(true);
  });
  it('n counts only rival paint: own and neutral tiles of the diamond are not counted (4 rival, 3 own, 2 neutral = 4)', () => {
    const s = soaking(D2.slice(0, 4));
    for (const [x, y] of D2.slice(4, 7)) paintTile(s.match, x, y, 0, 0);
    tick(s, { 0: USE });
    expect(plus(s).soaked[0]).toBe(4);
    expect(count(s, 0)).toBe(3); // mine stay mine
    expect(countsAgree(s)).toBe(true);
  });
  it('it keeps soaking for 60 ticks: paint that appears in the diamond until then is taken, later paint is not', () => {
    const s = soaking([[13, 0]]);
    tick(s, { 0: USE }); // tick 1: soaks (13, 0)
    tick(s, {}, 58); // tick 59
    paintTile(s.match, 12, 0, 1, 0);
    tick(s); // tick 60: still soaking
    expect([owner(s, 12, 0), plus(s).soaked[0]]).toEqual([-1, 2]);
    paintTile(s.match, 14, 0, 1, 0);
    tick(s); // tick 61: done
    expect([owner(s, 14, 0), plus(s).soaked[0]]).toEqual([1, 2]);
    expect(wrap(s).soak[0]).toBe(0);
  });
  it('n = 9 squeezes radius 3 (14 tiles here), n = 8 squeezes radius 2 (9 tiles)', () => {
    const big = soaking();
    tick(big, { 0: USE });
    tick(big, { 0: USE });
    expect(count(big, 0)).toBe(14);
    const small = soaking(D2.slice(1)); // 8 tiles
    tick(small, { 0: USE });
    expect(plus(small).soaked[0]).toBe(8);
    tick(small, { 0: USE });
    expect(count(small, 0)).toBe(9);
    for (const s of [big, small]) {
      expect(sab(s).held[0]).toBeNull();
      expect(plus(s).soaked[0]).toBe(0);
      expect(wrap(s).log.map((e) => e.kind)).toEqual(['squeeze']);
      expect(countsAgree(s)).toBe(true);
    }
  });
  it('with nobody holding B it squeezes itself on the 360th tick after the press, not the 359th', () => {
    const s = soaking();
    tick(s, { 0: USE });
    tick(s, {}, 358); // 359 ticks
    expect(count(s, 0)).toBe(0);
    expect(sab(s).held[0]).toBe('sponge');
    tick(s);
    expect(count(s, 0)).toBe(14);
    expect(sab(s).held[0]).toBeNull();
  });
  it('refused with no rival paint in the diamond: the card stays and nothing starts', () => {
    const s = soaking([]);
    tick(s, { 0: USE });
    expect(sab(s).held[0]).toBe('sponge');
    expect(plus(s).sponge[0]).toBe(0);
    expect(sab(s).used).toBe(0);
  });
  it('a tape keeps the paint under it from being soaked and cuts the diamond: what is behind it is out of reach', () => {
    const s = soaking();
    const at = (x: number, y: number) => y * 27 + x;
    wrap(s).strips.push({ owner: 1, team: 1, tiles: [at(12, 0), at(14, 0), at(12, 1), at(14, 1)], left: 100 });
    tick(s, { 0: USE });
    expect(plus(s).soaked[0]).toBe(3); // (13, 0), (13, 1), (13, 2)
    expect([11, 12, 14, 15].map((x) => owner(s, x, 0))).toEqual([1, 1, 1, 1]);
  });
  it('team 1 squeezes the mirror image', () => {
    const s = wrapRound([0, 1]);
    for (const [x, y] of D2) paintTile(s.match, 26 - x, y, 0, 0);
    put(s, 1, 13, 0);
    put(s, 0, 2, 14);
    give(s, 1, 'sponge');
    tick(s, { 1: USE });
    expect(plus(s).soaked[1]).toBe(9);
    tick(s, { 1: USE });
    expect(count(s, 1)).toBe(14);
  });
});

describe('Reventon: stained while loaded, the sponge bursts in the attacker colour and is gone', () => {
  it('a rival blast: radius 2 around you in its colour, beyond the blast itself; the card does not fall as loot', () => {
    const s = soaking(D2, { rescue: true });
    tick(s, { 0: USE });
    tick(s, {}, 5);
    blastAt(s, 13, 2, 1, 1); // its diamond reaches (13, 0), (13, 1), (12, 1), (14, 1) but not (11, 0) or (15, 0)
    tick(s);
    expect(s.match.bodies[0]!.stun).toBeGreaterThan(0);
    expect([11, 15].map((x) => owner(s, x, 0))).toEqual([1, 1]); // the burst's
    expect(plus(s).sponge[0]).toBe(0);
    expect(plus(s).soaked[0]).toBe(0);
    expect(sab(s).held[0]).toBeNull();
    expect(s.match.res!.loot).toEqual([]);
    expect(plus(s).squeezeFx[0]).toBeGreaterThan(0);
    expect(wrap(s).log.map((e) => [e.kind, e.n])).toEqual([['burst', 9]]);
    expect(countsAgree(s)).toBe(true);
    tick(s, {}, 400);
    expect(wrap(s).log).toHaveLength(1); // it does not squeeze again later
  });
  it('a sponge in hand that is not soaking does not burst: it falls clean as loot', () => {
    const s = wrapRound([0, 1], 5, { rescue: true });
    put(s, 0, 13, 0);
    put(s, 1, 24, 14);
    give(s, 0, 'sponge');
    blastAt(s, 13, 1, 1, 1);
    tick(s);
    expect(wrap(s).log).toEqual([]);
    expect(s.match.res!.loot.map((l) => l.kind)).toEqual(['sponge']);
  });
});
