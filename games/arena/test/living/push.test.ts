import { describe, expect, it } from 'vitest';
import { MAX_PUSH_UNITS } from '../../sim';
import { put, tick } from '../match-drive';
import { at, brush, openRound, sofa, tileOf } from './drive';

const pair = (s: ReturnType<typeof openRound>) => s.match.live!.pairs[0]!;
const wall = (s: ReturnType<typeof openRound>, x: number, y: number) => {
  s.match.live!.base[y * 27 + x] = 1;
  s.grid.map.solid[y * 27 + x] = 1;
};

describe('the push rule: a body in the way is moved along the part, a pinata makes it wait', () => {
  it('a sofa closing a tile pushes the body on it one tile along its rail, flush with the sofa', () => {
    const s = openRound([sofa(4, 4, 0)]); // left sofa on (4,4)+(5,4); on tick 300 it takes (6,4), moving right
    put(s, 0, 6, 4);
    tick(s, {}, 301);
    expect(pair(s).state).toBe(1);
    expect([s.grid.bodies[0]!.x, s.grid.bodies[0]!.y]).toEqual(at(7, 4));
    expect(s.grid.map.solid[4 * 27 + 6]).toBe(1);
    tick(s, {}, 300); // going back: it takes (4,4), moving left
    put(s, 0, 4, 4);
    expect(pair(s).state).toBe(0); // nobody was there at tick 600: it changed
  });

  it('the mirror member pushes the other way', () => {
    const s = openRound([sofa(4, 4, 0)]);
    put(s, 1, 20, 4); // the right sofa takes (20,4) moving left
    tick(s, {}, 301);
    expect(tileOf(s, 1)).toEqual([19, 4]);
    expect(s.grid.bodies[1]!.x).toBe(at(19, 4)[0]);
  });

  it('a body straddling two tiles ends flush with the part, a whole tile only if it needs it', () => {
    const s = openRound([sofa(4, 4, 0)]);
    s.grid.bodies[0]!.x = 6 * 16 + 8 + 5; // straddles tiles 6 and 7
    s.grid.bodies[0]!.y = 4 * 16 + 8;
    tick(s, {}, 301);
    expect(s.grid.bodies[0]!.x).toBe(7 * 16 + 8); // pushed 11 units: its edge touches the sofa's end
  });

  it('a clockwise bar sweeps bodies against the old bar; the right member the other way', () => {
    const s = openRound([brush(4, 4, 0)]); // takes (4,5),(4,6) pushing left; the mirror takes (22,5),(22,6) pushing right
    put(s, 0, 4, 6);
    put(s, 1, 22, 5);
    tick(s, {}, 241);
    expect(pair(s).state).toBe(1);
    expect([tileOf(s, 0), tileOf(s, 1)]).toEqual([
      [3, 6],
      [23, 5],
    ]);
  });

  it('a wall behind the body: nobody is pushed through it, the pair waits (both members, nothing applied)', () => {
    const s = openRound([sofa(4, 4, 0)]);
    put(s, 0, 6, 4);
    put(s, 1, 20, 4); // this one could be pushed
    wall(s, 7, 4);
    const before = [s.grid.bodies[0]!.x, s.grid.bodies[1]!.x];
    tick(s, {}, 400);
    expect(pair(s)).toMatchObject({ state: 0, pending: true });
    expect(pair(s).waited).toBe(400 - 300);
    expect(s.grid.bodies.map((b) => b.x)).toEqual(before); // the mirror member did not go ahead without it
    expect(s.grid.map.solid[4 * 27 + 6]).toBe(0);
    put(s, 0, 6, 8); // the body leaves: next tick it changes, once (it does not catch up on the turns it missed)
    tick(s);
    expect(pair(s)).toMatchObject({ state: 1, pending: false });
    expect(pair(s).movedAt).toBe(400);
    expect(tileOf(s, 1)).toEqual([19, 4]);
    tick(s, {}, 198); // ticks 401-598
    expect(pair(s).state).toBe(1);
    tick(s, {}, 2); // 599 and 600: the regular change
    expect(pair(s).state).toBe(0); // the schedule goes on from its own period
  });

  it('a push never goes farther than MAX_PUSH_UNITS: with furniture 3 tiles behind it a body waits rather than jumps', () => {
    expect(MAX_PUSH_UNITS).toBe(48);
    const s = openRound([sofa(4, 4, 0)]);
    put(s, 0, 6, 4);
    for (const x of [7, 8, 9]) wall(s, x, 4);
    tick(s, {}, 301);
    expect(pair(s)).toMatchObject({ state: 0, pending: true });
  });

  it('a pinata on a tile about to shut is never moved: the pair waits until it goes off', () => {
    const s = openRound([sofa(4, 4, 0)]);
    put(s, 0, 6, 4);
    tick(s, {}, 299); // tick 299: just before the change
    s.match.pinatas.push({ id: 90, x: 6, y: 4, team: 0, owner: 0, fuse: 60, radius: 2 });
    put(s, 0, 6, 9);
    tick(s, {}, 2);
    expect(pair(s)).toMatchObject({ state: 0, pending: true });
    expect(s.match.pinatas).toHaveLength(1);
    expect([s.match.pinatas[0]!.x, s.match.pinatas[0]!.y]).toEqual([6, 4]);
    tick(s, {}, 60); // the fuse runs out
    expect(s.match.pinatas).toHaveLength(0);
    expect(pair(s)).toMatchObject({ state: 1, pending: false });
  });

  it('a body on the pivot is never pushed (the pivot stays open)', () => {
    const s = openRound([brush(4, 4, 0)]);
    put(s, 0, 4, 4);
    tick(s, {}, 241 * 4);
    expect(tileOf(s, 0)).toEqual([4, 4]);
    expect(pair(s).waited).toBe(0);
  });
});
