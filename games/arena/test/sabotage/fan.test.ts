import { describe, expect, it } from 'vitest';
import { DROP, USE, give, put, round, sab, tick } from './sab-drive';

/** Rival (body 1) drops a pinata on (x, 0) and leaves; body 0 stands on (bx, 0) with the fan. */
function setup(px: number, bx: number) {
  const s = round([0, 1, 0]);
  put(s, 1, px, 0);
  put(s, 2, 20, 14);
  tick(s, { 1: DROP });
  put(s, 1, 24, 14);
  put(s, 0, bx, 0);
  give(s, 0, 'fan');
  return s;
}

describe('fan: pinatas within 4 tiles go 2 tiles away from you', () => {
  it('pushes along the longer axis, keeps the fuse, and the gust shows on the TV', () => {
    const s = setup(10, 8);
    const fuse = s.match.pinatas[0]!.fuse;
    tick(s, { 0: USE });
    const p = s.match.pinatas[0]!;
    expect([p.x, p.y]).toEqual([12, 0]);
    expect(p.fuse).toBe(fuse - 1); // only the tick's own burn
    expect(sab(s).gust[0]).toBeGreaterThan(0);
  });
  it('pushes its owner team pinatas too, and straight down when the rival pinata is below', () => {
    const s = round([0, 1]);
    put(s, 1, 22, 3);
    tick(s, { 1: DROP }); // (22, 3)... a pinata of team 1
    put(s, 0, 22, 1);
    give(s, 0, 'fan');
    tick(s, { 0: USE });
    expect([s.match.pinatas[0]!.x, s.match.pinatas[0]!.y]).toEqual([22, 5]);
  });
  it('out of range (more than 4 tiles) it does not move', () => {
    const s = setup(14, 8);
    tick(s, { 0: USE });
    expect([s.match.pinatas[0]!.x, s.match.pinatas[0]!.y]).toEqual([14, 0]);
  });
  it('counter: a pinata against the wall (or furniture) does not move', () => {
    const s = setup(0, 2);
    tick(s, { 0: USE });
    expect([s.match.pinatas[0]!.x, s.match.pinatas[0]!.y]).toEqual([0, 0]);
  });
  it('counter: it stops before another pinata', () => {
    const s = setup(10, 8);
    s.match.pinatas.push({ id: 99, x: 12, y: 0, team: 1, owner: 1, fuse: 100, radius: 2 });
    tick(s, { 0: USE });
    expect([s.match.pinatas[0]!.x, s.match.pinatas[0]!.y]).toEqual([11, 0]);
  });
});
