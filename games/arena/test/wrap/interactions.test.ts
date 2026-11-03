// How the sponge v2 and the packing tape meet the other rules: shots (PR4), Rescue and Loot (PR3), the acts (PR2), the invisible ink (F8a) and the Hourglass (F4).
import { describe, expect, it } from 'vitest';
import { FINAL_TICKS, paintTile } from '../../sim';
import { USE, blastAt, countsAgree, face, give, owner, plus, put, sab, tick, wrap, wrapRound } from './wrap-drive';

const at = (x: number, y: number) => y * 27 + x;
const D2: [number, number][] = [11, 12, 13, 14, 15].map((x): [number, number] => [x, 0]).concat([12, 13, 14].map((x): [number, number] => [x, 1]), [[13, 2]]);

describe('with the projectiles (PR4)', () => {
  it('a Mareo shot flies through the tape and hits the rival behind it', () => {
    const s = wrapRound([0, 1], 5, { projectiles: true });
    put(s, 0, 5, 0);
    put(s, 1, 9, 0);
    face(s, 0, 0);
    give(s, 0, 'dizzy');
    wrap(s).strips.push({ owner: 1, team: 1, tiles: [at(7, 0), at(7, 1)], left: 1000 });
    tick(s, { 0: USE });
    tick(s, {}, 12 + 19);
    expect(plus(s).dizzy[1]).toBeGreaterThan(0);
  });
  it('a Pegote that explodes on the rival behind a tape is cut by it like any blast', () => {
    const s = wrapRound([0, 1], 5, { projectiles: true });
    put(s, 0, 4, 0);
    put(s, 1, 24, 14);
    wrap(s).strips.push({ owner: 1, team: 1, tiles: [at(5, 0), at(5, 1)], left: 1000 });
    blastAt(s, 6, 0, 1, 1);
    tick(s);
    expect([6, 7, 8].map((x) => owner(s, x, 0))).toEqual([1, 1, 1]);
    expect([5, 4].map((x) => owner(s, x, 0))).toEqual([-1, -1]);
    expect(s.match.bodies[0]!.stun).toBe(0); // the body on the far side of the tape is not stained
  });
});

describe('with Rescue and Loot (PR3)', () => {
  it('a stain during the tape wind-up cuts it and leaves no loot (the card was spent at the press)', () => {
    const s = wrapRound([0, 1], 5, { rescue: true });
    put(s, 0, 1, 7);
    face(s, 0, 0);
    put(s, 1, 24, 14);
    give(s, 0, 'tape');
    tick(s, { 0: USE }, 4);
    blastAt(s, 1, 7, 1, 1);
    tick(s, {}, 30);
    expect(wrap(s).strips).toEqual([]);
    expect(s.match.res!.loot).toEqual([]);
  });
  it('a stain after the tape landed does not take it away: it is a thing of the floor', () => {
    const s = wrapRound([0, 1], 5, { rescue: true });
    put(s, 0, 1, 7);
    face(s, 0, 0);
    put(s, 1, 24, 14);
    give(s, 0, 'tape');
    tick(s, { 0: USE }, 12);
    blastAt(s, 1, 7, 1, 1);
    tick(s, {}, 30);
    expect(wrap(s).strips).toHaveLength(1);
  });
  it('a Tape card that fell as loot (a stain with the card still in hand) is picked up by a rival as a plain card and works for them', () => {
    const s = wrapRound([0, 1], 5, { rescue: true });
    put(s, 0, 1, 7);
    put(s, 1, 24, 14);
    give(s, 0, 'tape');
    blastAt(s, 1, 7, 1, 1);
    tick(s);
    expect(s.match.res!.loot.map((l) => l.kind)).toEqual(['tape']);
    const l = s.match.res!.loot[0]!;
    put(s, 0, 1, 14); // the owner leaves it
    put(s, 1, l.x, l.y);
    tick(s, {}, 2);
    expect(sab(s).held[1]).toBe('tape');
    face(s, 1, 0);
    tick(s, { 1: USE }, 12);
    expect(wrap(s).strips).toHaveLength(1);
  });
});

describe('with the acts (PR2)', () => {
  it('in the Final the squeeze stays radius 2 (the Final adds to the pinatas, not to the sponge): 9 tiles with n = 8', () => {
    const s = wrapRound([0, 1], 5, { events: true, phases: true });
    s.grid.tick = s.grid.durationTicks - FINAL_TICKS + 5;
    s.match.ph!.phase = 'final';
    for (const [x, y] of D2.slice(1)) paintTile(s.match, x, y, 1, 0);
    put(s, 0, 13, 0);
    put(s, 1, 24, 14);
    give(s, 0, 'sponge');
    tick(s, { 0: USE });
    tick(s, { 0: USE });
    expect(s.match.paint.reduce((n, v) => n + (v === 0 ? 1 : 0), 0)).toBe(9);
  });
});

describe('with the invisible ink (F8a)', () => {
  it('soaking rival paint that was hidden counts it and shows the neutral tile; squeezing under your own ink hides the new paint', () => {
    const s = wrapRound([0, 1]);
    plus(s).veil[1] = 600;
    for (const [x, y] of D2) paintTile(s.match, x, y, 1, 0); // hidden under the rival's ink
    plus(s).veil[1] = 0;
    expect(plus(s).veiled[at(13, 0)]).toBe(1);
    put(s, 0, 13, 0);
    put(s, 1, 24, 14);
    give(s, 0, 'sponge');
    plus(s).veil[0] = 600;
    tick(s, { 0: USE });
    expect(plus(s).soaked[0]).toBe(9);
    expect(plus(s).veiled[at(13, 0)]).toBe(0);
    tick(s, { 0: USE });
    expect(owner(s, 13, 0)).toBe(0);
    expect(plus(s).veiled[at(13, 0)]).toBe(1);
    expect(countsAgree(s)).toBe(true);
  });
});

describe('with the Hourglass (F4)', () => {
  it('the clocks run on ticks, not on the length of the round: more time on the clock changes nothing', () => {
    const s = wrapRound([0, 1]);
    s.grid.durationTicks += 900; // what the Hourglass does when it adds 15 s
    put(s, 0, 1, 7);
    face(s, 0, 0);
    put(s, 1, 24, 14);
    give(s, 0, 'tape');
    tick(s, { 0: USE }, 12 + 359);
    expect(wrap(s).strips).toHaveLength(1);
    tick(s);
    expect(wrap(s).strips).toEqual([]);
  });
});
