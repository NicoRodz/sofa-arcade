import { describe, expect, it } from 'vitest';
import { USE, give, plus, plusRound, put, sab, tick } from './plus-drive';
import { NONE, type ManchazoState, type Pinata } from '../../sim';

const pos = (s: ManchazoState, i: number) => [(s.grid.bodies[i]!.x - 8) / 16, (s.grid.bodies[i]!.y - 8) / 16];
const blastOn = (s: ManchazoState, i: number): Pinata => {
  const p: Pinata = { id: 90, x: pos(s, i)[0]!, y: pos(s, i)[1]!, team: 1 - s.grid.bodies[i]!.team, owner: 1, fuse: 1, radius: 2 };
  s.match.pinatas.push(p);
  return p;
};

describe('swap (Cambiazo): you trade places with the nearest rival within 6 tiles; both are immune to stains for 0.5 s', () => {
  it('trades the places of the two bodies, spends the card and keeps the tie-break on the lowest id', () => {
    const s = plusRound([0, 1, 1]);
    put(s, 0, 5, 0);
    put(s, 1, 8, 0); // 3 tiles
    put(s, 2, 5, 3); // 3 tiles too: the lower id wins
    give(s, 0, 'swap');
    tick(s, { 0: USE });
    expect(pos(s, 0)).toEqual([8, 0]);
    expect(pos(s, 1)).toEqual([5, 0]);
    expect(pos(s, 2)).toEqual([5, 3]);
    expect(sab(s).held[0]).toBeNull();
    expect(plus(s).immune.slice(0, 3)).toEqual([29, 29, 0]);
  });
  it('picks the nearer one over a lower id, and 6 tiles is in range, 7 is not', () => {
    const s = plusRound([0, 1, 1]);
    put(s, 0, 5, 0);
    put(s, 1, 12, 0); // 7: out
    put(s, 2, 11, 0); // 6: in
    give(s, 0, 'swap');
    tick(s, { 0: USE });
    expect(pos(s, 0)).toEqual([11, 0]);
    expect(pos(s, 2)).toEqual([5, 0]);
    expect(pos(s, 1)).toEqual([12, 0]);
  });
  it('counter: nobody within range, nothing moves and the card stays in hand', () => {
    const s = plusRound([0, 1]);
    put(s, 0, 2, 0);
    put(s, 1, 20, 0);
    give(s, 0, 'swap');
    tick(s, { 0: USE });
    expect(pos(s, 0)).toEqual([2, 0]);
    expect(sab(s).held[0]).toBe('swap');
    expect(sab(s).used).toBe(0);
    expect(plus(s).immune).toEqual([0, 0]);
  });
  it('both stand still afterwards (a held stick reads as a new request) and a swap with a teammate is never offered', () => {
    const s = plusRound([0, 0, 1]);
    put(s, 0, 5, 0);
    put(s, 1, 6, 0); // the teammate is right there
    put(s, 2, 9, 0);
    give(s, 0, 'swap');
    tick(s, { 0: USE });
    expect(pos(s, 0)).toEqual([9, 0]);
    expect(pos(s, 1)).toEqual([6, 0]);
    expect(s.grid.bodies[0]!.dir).toBe(NONE);
    expect(s.grid.bodies[2]!.dir).toBe(NONE);
  });
  it('immunity: a blast that lands in the next 0.5 s does not stain either body; after it, it does', () => {
    const run = (wait: number) => {
      const s = plusRound([0, 1]);
      put(s, 0, 5, 0);
      put(s, 1, 8, 0);
      give(s, 0, 'swap');
      tick(s, { 0: USE });
      tick(s, {}, wait);
      blastOn(s, 0); // a rival pinata goes off on body 0's tile
      tick(s);
      return s.match.bodies[0]!.stun;
    };
    expect(run(10)).toBe(0);
    expect(run(40)).toBeGreaterThan(0);
  });
});
