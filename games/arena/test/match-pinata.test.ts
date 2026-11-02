import { describe, expect, it } from 'vitest';
import { CHAIN_TICKS, FUSE_TICKS, MAX_ACTIVE, STUN_TICKS, TRAIL_TICKS, blastTiles, handicap } from '../sim';
import { DROP, NONE_IN, duel, put, tick, tileOwner } from './match-drive';

describe('pinata blast', () => {
  it('is the Manhattan diamond: 13 tiles at radius 2 on open floor, and radius 3 reaches every tile of radius 2 and more', () => {
    const r2 = blastTiles(3, 7, 2);
    expect(r2).toHaveLength(13);
    expect(r2.every(([x, y]) => Math.abs(x - 3) + Math.abs(y - 7) <= 2)).toBe(true);
    const r3 = blastTiles(3, 7, 3).map(([x, y]) => `${x},${y}`);
    expect(r2.every(([x, y]) => r3.includes(`${x},${y}`))).toBe(true);
    expect(r3.length).toBeGreaterThan(13);
  });
  it('walls cut it: a tile behind furniture is not painted even inside the radius', () => {
    // (10,10) is furniture in row 10 ('..#...#..#...#...#..#...#..' -> x=9 is #): from (8,10) the tile (10,10) is 2 away but its way is through x=9
    const t = blastTiles(8, 10, 2).map(([x, y]) => `${x},${y}`);
    expect(t).not.toContain('10,10');
    expect(t).not.toContain('9,10');
    expect(t).toContain('8,10');
  });
});

describe('the spec numbers', () => {
  it('fuse 2 s, chain 0.15 s, stun 1.2 s, footprints 3 s, 2 pinatas at once (60 ticks a second; written out so a changed constant fails)', () => {
    expect([FUSE_TICKS, CHAIN_TICKS, STUN_TICKS, TRAIL_TICKS, MAX_ACTIVE]).toEqual([120, 9, 72, 180, 2]);
  });
});

describe('dropping and exploding', () => {
  it('a pinata goes off after the 2 s fuse and paints its team colour, not before', () => {
    const s = duel();
    put(s, 0, 13, 7);
    put(s, 1, 0, 0);
    tick(s, { 0: DROP });
    expect(s.match.pinatas).toHaveLength(1);
    tick(s, { 0: NONE_IN }, FUSE_TICKS - 2);
    expect(s.match.pinatas).toHaveLength(1);
    expect(s.match.counts[0]).toBe(0);
    tick(s, {}, 2);
    expect(s.match.pinatas).toHaveLength(0);
    expect(tileOwner(s, 13, 7)).toBe(0);
    expect(s.match.counts[0]).toBe(blastTiles(13, 7, 2).length);
    expect(s.match.counts[1]).toBe(0);
  });
  it('a rival blast repaints, and the counts follow', () => {
    const s = duel();
    put(s, 0, 13, 7);
    put(s, 1, 13, 7);
    tick(s, { 0: DROP });
    tick(s, { 1: DROP }, 1); // same tile: the second drop is refused
    expect(s.match.pinatas).toHaveLength(1);
    put(s, 1, 14, 7);
    tick(s, { 1: DROP });
    tick(s, {}, FUSE_TICKS);
    expect(s.match.counts[0]! + s.match.counts[1]!).toBe(s.match.paint.filter((v) => v >= 0).length);
    expect(s.match.counts[1]).toBeGreaterThan(0);
  });
  it('only MAX_ACTIVE pinatas of a player stand at once', () => {
    const s = duel(1, [0, 1, 0, 1]);
    put(s, 2, 0, 0); // keep body 0 clear of the others
    for (let k = 0; k < MAX_ACTIVE + 1; k++) {
      put(s, 0, 2 + 2 * k, 0);
      tick(s, { 0: DROP });
    }
    expect(s.match.pinatas.filter((p) => p.owner === 0)).toHaveLength(MAX_ACTIVE);
  });
  it('the small team keeps playing past the cap with its reserve, the even team cannot', () => {
    const uneven = duel(1, [0, 0, 0, 1]); // 3 against 1: team 1 has radius 3 and 2 in reserve
    const m = uneven.match;
    expect([m.radius[0], m.radius[1], m.reserve[0], m.reserve[1]]).toEqual([2, 3, 0, 2]);
    for (let k = 0; k < MAX_ACTIVE + 3; k++) {
      put(uneven, 3, 1 + 2 * k, 14);
      tick(uneven, { 3: DROP });
    }
    expect(m.pinatas.filter((p) => p.owner === 3)).toHaveLength(MAX_ACTIVE + 2);
    expect(m.reserve[1]).toBe(0);
    expect(m.pinatas.every((p) => p.radius === 3)).toBe(true);
    const even = duel(1, [0, 1]);
    expect(handicap(even.match.sizes)).toEqual({ radius: [2, 2], reserve: [0, 0] });
  });
});

describe('stain (manchado)', () => {
  const setup = () => {
    const s = duel();
    put(s, 0, 13, 7);
    put(s, 1, 14, 7);
    tick(s, { 0: DROP });
    tick(s, {}, FUSE_TICKS);
    return s;
  };
  it('a rival in the blast is still for 1.2 s; the dropper is not hurt by its own pinata', () => {
    const s = setup();
    expect(s.match.bodies[1]!.stun).toBeGreaterThan(0);
    expect(s.match.bodies[0]!.stun).toBe(0);
    const x = s.grid.bodies[1]!.x;
    tick(s, { 1: { sx: 1000, sy: 0, drop: false } }, STUN_TICKS - 2);
    expect(s.grid.bodies[1]!.x).toBe(x); // the stick is ignored while stained
    tick(s, { 1: { sx: 1000, sy: 0, drop: false } }, 4);
    expect(s.grid.bodies[1]!.x).toBeGreaterThan(x);
  });
  it('a stick held through the stun and released before it ends does not move the body afterwards (nothing is queued while stained)', () => {
    const s = setup();
    const x = s.grid.bodies[1]!.x;
    tick(s, { 1: { sx: 1000, sy: 0, drop: false } }, STUN_TICKS - 1);
    tick(s, {}, 40);
    expect(s.grid.bodies[1]!.x).toBe(x);
  });
  it('a second blast on a stained player does not renew the stun', () => {
    const s = duel();
    put(s, 0, 13, 7);
    put(s, 1, 14, 7);
    tick(s, { 0: DROP });
    put(s, 0, 12, 7);
    tick(s, { 0: DROP }); // second pinata: the first blast chains it, so it goes off CHAIN_TICKS after
    tick(s, {}, FUSE_TICKS - 1); // first blast: stun starts
    const stun = s.match.bodies[1]!.stun;
    expect(stun).toBeGreaterThan(0);
    tick(s, {}, CHAIN_TICKS + 1); // the second blast went off in between
    expect(s.match.pinatas).toHaveLength(0);
    expect(s.match.bodies[1]!.stun).toBe(stun - CHAIN_TICKS - 1);
  });
  it('a stained player cannot drop a pinata', () => {
    const s = setup();
    tick(s, { 1: DROP });
    expect(s.match.pinatas).toHaveLength(0);
  });
  it('after the stun, 3 s of footprints in the rival colour: it paints for the other team while it walks', () => {
    const s = setup();
    tick(s, {}, STUN_TICKS);
    expect(s.match.bodies[1]!.trail).toBeGreaterThan(0);
    const mine = s.match.counts[1]!;
    const walk = { sx: 0, sy: -1000, drop: false };
    tick(s, { 1: walk }, 30);
    expect(s.match.counts[1]).toBe(mine); // its own team gains nothing from its steps
    expect(s.match.counts[0]).toBeGreaterThan(blastTiles(13, 7, 2).length - 1);
    tick(s, { 1: walk }, TRAIL_TICKS);
    expect(s.match.bodies[1]!.trail).toBe(0);
  });
});

describe('chain', () => {
  it('pinatas due on the same tick go off in placement order: the later one paints last, so it keeps the shared tiles', () => {
    const s = duel();
    put(s, 0, 12, 7);
    put(s, 1, 13, 7);
    tick(s, { 0: DROP, 1: DROP });
    tick(s, {}, FUSE_TICKS);
    expect(tileOwner(s, 12, 7)).toBe(1);
    expect(tileOwner(s, 13, 7)).toBe(1);
    expect(tileOwner(s, 12, 5)).toBe(0); // only the first reaches it
  });
  it('a pinata reached by a blast goes off 0.15 s later, not at its own fuse', () => {
    const s = duel();
    put(s, 0, 13, 7);
    put(s, 1, 0, 0);
    tick(s, { 0: DROP });
    tick(s, {}, FUSE_TICKS - 40); // first pinata has 40 ticks left
    put(s, 1, 12, 7);
    tick(s, { 1: DROP }); // second: full fuse, inside the first blast
    tick(s, {}, 40);
    expect(s.match.pinatas).toHaveLength(1);
    expect(s.match.pinatas[0]!.fuse).toBeLessThanOrEqual(CHAIN_TICKS);
    tick(s, {}, CHAIN_TICKS);
    expect(s.match.pinatas).toHaveLength(0);
  });
});
