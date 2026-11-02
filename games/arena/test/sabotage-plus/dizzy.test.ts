import { describe, expect, it } from 'vitest';
import { dizzyThreat, type ManchazoState, type Pinata } from '../../sim';
import { USE, give, plus, plusRound, put, stick, tick } from './plus-drive';

const x = (s: ManchazoState, i: number) => s.grid.bodies[i]!.x;

/** Body 0 (team 0) on (10, 0) with the Mareo; rivals 1, 2, 3 at 1, 2 and 3 tiles on the same row. */
function setup() {
  const s = plusRound([0, 1, 1, 1]);
  put(s, 0, 10, 0);
  put(s, 1, 11, 0);
  put(s, 2, 12, 0);
  put(s, 3, 13, 0);
  give(s, 0, 'dizzy');
  return s;
}

describe('dizzy (Mareo): after 0.5 s of visible charge, rivals within 2 tiles play 3 s with the stick inverted', () => {
  it('charges 0.5 s first (nobody dizzy), then hits the rivals within 2 tiles of the caster and only them', () => {
    const s = setup();
    tick(s, { 0: USE });
    expect(plus(s).charge[0]).toBe(29);
    tick(s, {}, 28);
    expect(plus(s).dizzy).toEqual([0, 0, 0, 0]);
    tick(s);
    expect(plus(s).dizzy).toEqual([0, 180, 180, 0]);
    expect(plus(s).charge[0]).toBe(0);
  });
  it('the stick is read backwards: pushing right walks left; the caster and the others walk as usual', () => {
    const s = plusRound([0, 1, 1]);
    put(s, 0, 10, 0);
    put(s, 1, 10, 14);
    put(s, 2, 16, 14);
    plus(s).dizzy[1] = 180;
    tick(s, { 0: stick(1000, 0), 1: stick(1000, 0), 2: stick(1000, 0) }, 20);
    expect(x(s, 0)).toBeGreaterThan(10 * 16 + 8);
    expect(x(s, 1)).toBeLessThan(10 * 16 + 8);
    expect(x(s, 2)).toBeGreaterThan(16 * 16 + 8);
  });
  it('ends after 3 s: the same stick walks the right way again', () => {
    const s = plusRound([0, 1]);
    put(s, 1, 10, 14);
    plus(s).dizzy[1] = 180;
    tick(s, {}, 180);
    expect(plus(s).dizzy[1]).toBe(0);
    const x0 = x(s, 1);
    tick(s, { 1: stick(1000, 0) }, 20);
    expect(x(s, 1)).toBeGreaterThan(x0);
  });
  it('counter: a rival that walks away during the charge is not reached (the range is taken when it ends)', () => {
    const s = setup();
    tick(s, { 0: USE });
    tick(s, {}, 10);
    put(s, 1, 11, 14); // out
    put(s, 2, 12, 14);
    tick(s, {}, 25);
    expect(plus(s).dizzy).toEqual([0, 0, 0, 0]);
  });
  it('counter: a stain on the caster cuts the charge', () => {
    const s = setup();
    tick(s, { 0: USE });
    const p: Pinata = { id: 90, x: 10, y: 0, team: 1, owner: 1, fuse: 1, radius: 2 };
    s.match.pinatas.push(p);
    tick(s, {}, 2);
    expect(s.match.bodies[0]!.stun).toBeGreaterThan(0);
    expect(plus(s).charge[0]).toBe(0);
    tick(s, {}, 40);
    expect(plus(s).dizzy).toEqual([0, 0, 0, 0]);
  });
  it('counter: a body immune from a swap is not dizzied', () => {
    const s = setup();
    plus(s).immune[1] = 60;
    tick(s, { 0: USE });
    tick(s, {}, 29);
    expect(plus(s).dizzy).toEqual([0, 0, 180, 0]);
  });
  it('warns the rivals the charge will reach (their phone buzzes), and nobody else', () => {
    const s = setup();
    expect([1, 2, 3].map((i) => dizzyThreat(s, i))).toEqual([false, false, false]); // no charge, no threat
    tick(s, { 0: USE });
    expect([0, 1, 2, 3].map((i) => dizzyThreat(s, i))).toEqual([false, true, true, false]);
  });
});
