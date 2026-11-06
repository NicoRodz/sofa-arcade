import { describe, expect, it } from 'vitest';
import { cancel, captainCancel, captainGo, keyboardPick, openVote, setCaptain, setConnected, settle } from './vote';
import { core, Rig } from './vote.kit';

describe('statu quo', () => {
  const pause = (n: number) =>
    new Rig(n, { kind: 'destructive', options: ['continue', 'restart', 'lobby', 'home'], current: 'continue', windowMs: 15_000 });
  it('destructive: fewer than M votes at the deadline -> the current option wins', () => {
    const r = pause(5); // M = 3
    r.at(0).vote(1, 'restart').vote(2, 'restart');
    r.at(15_000);
    expect(r.result).toMatchObject({ winner: 'continue', via: 'statu-quo', reason: 'deadline' });
  });
  it('destructive: a tie between destructive options keeps the current one', () => {
    const r = pause(4);
    r.vote(1, 'restart').vote(2, 'lobby').vote(3, 'restart').vote(4, 'lobby');
    r.at(1500);
    expect(r.result).toMatchObject({ winner: 'continue', via: 'statu-quo', reason: 'all' });
  });
  it('destructive: M votes close early and win', () => {
    const r = pause(5);
    r.vote(1, 'restart').vote(2, 'restart').vote(3, 'restart');
    r.at(1500);
    expect(r.result).toMatchObject({ winner: 'restart', via: 'majority', reason: 'majority' });
  });
  it('destructive: a plurality below M does not win even when it is the leader', () => {
    const r = pause(6); // M = 4
    r.vote(1, 'restart').vote(2, 'restart').vote(3, 'restart').vote(4, 'lobby');
    r.at(15_000);
    expect(r.result?.winner).toBe('continue');
  });
  it('destructive: an unreached M with E=1 is impossible; the lone voter decides', () => {
    const r = pause(1);
    r.vote(1, 'home');
    r.at(1500);
    expect(r.result).toMatchObject({ winner: 'home' });
  });
  it('lobby item: tie keeps the current value and never opens a roulette', () => {
    const r = new Rig(4, { kind: 'item', options: ['easy', 'normal', 'hard'], current: 'normal', windowMs: null });
    r.vote(1, 'easy').vote(2, 'hard');
    expect(r.snap()).toMatchObject({ leader: 'normal', tie: true });
    r.v = settle(r.v, r.ctx());
    expect(r.result).toMatchObject({ winner: 'normal', via: 'statu-quo', reason: 'settle' });
  });
  it('lobby item: the live leader is shown, no votes keeps the current value', () => {
    const r = new Rig(4, { kind: 'item', options: ['easy', 'normal', 'hard'], current: 'normal', windowMs: null });
    expect(r.snap().leader).toBe('normal');
    r.vote(1, 'hard');
    expect(r.snap().leader).toBe('hard');
    r.vote(2, 'easy').vote(3, 'easy');
    expect(r.snap().leader).toBe('easy');
  });
  it('lobby item: no clock and no early close, even with everyone agreeing', () => {
    const r = new Rig(2, { kind: 'item', options: ['easy', 'hard'], current: 'easy', windowMs: null });
    r.vote(1, 'hard').vote(2, 'hard');
    r.at(10 * 60_000);
    expect(r.v.status).toBe('open');
    expect(r.snap()).toMatchObject({ remainingMs: null, closing: null, leader: 'hard' });
    r.v = settle(r.v, r.ctx());
    expect(r.result).toMatchObject({ winner: 'hard', via: 'plurality' });
  });
  it('item and destructive votes require a current option', () => {
    expect(() => openVote({ voteId: 1, kind: 'item', options: ['a'], windowMs: null }, 0)).toThrow();
    expect(() => openVote({ voteId: 1, kind: 'destructive', options: ['a', 'b'], current: 'z', windowMs: 1 }, 0)).toThrow();
  });
});

describe("Captain's shortcut", () => {
  it('"Ya!" is ignored before 4 s, then closes with the leader after the grace', () => {
    const r = new Rig(8);
    r.at(0).vote(2, 'B');
    r.at(3999);
    r.v = captainGo(r.v, r.ctx(), 1);
    expect(r.snap().closing).toBeNull();
    r.at(4000);
    r.v = captainGo(r.v, r.ctx(), 1);
    expect(r.snap().closing).toMatchObject({ reason: 'captain', inMs: 1500 });
    r.at(5500);
    expect(r.result).toMatchObject({ winner: 'B', reason: 'captain' });
  });
  it('only the Captain can use it', () => {
    const r = new Rig(8);
    r.vote(2, 'B');
    r.at(5000);
    const before = core(r.v);
    r.v = captainGo(r.v, r.ctx(), 2);
    expect(core(r.v)).toEqual(before);
  });
  it('does nothing with no votes', () => {
    const r = new Rig(3);
    r.at(5000);
    r.v = captainGo(r.v, r.ctx(), 1);
    expect(r.snap().closing).toBeNull();
  });
  it('can be cancelled by the Captain (not by others) and the vote goes on', () => {
    const r = new Rig(8);
    r.vote(2, 'B');
    r.at(5000);
    r.v = captainGo(r.v, r.ctx(), 1);
    r.at(5500);
    r.v = captainCancel(r.v, r.ctx(), 2);
    expect(r.snap().closing?.reason).toBe('captain');
    r.v = captainCancel(r.v, r.ctx(), 1);
    expect(r.snap().closing).toBeNull();
    r.at(9000);
    expect(r.v.status).toBe('open');
  });
  it('the Captain closing survives votes changing the picture, and resolves by the votes of that moment', () => {
    const r = new Rig(8);
    r.vote(2, 'B');
    r.at(5000);
    r.v = captainGo(r.v, r.ctx(), 1);
    r.at(5500).vote(3, 'C').vote(4, 'C');
    expect(r.snap().closing?.reason).toBe('captain');
    r.at(6500);
    expect(r.result).toMatchObject({ winner: 'C', reason: 'captain' });
  });
  it('with a tie the Captain closing also uses the roulette', () => {
    const r = new Rig(8);
    r.rng = () => 0.99;
    r.vote(2, 'A').vote(3, 'B');
    r.at(5000);
    r.v = captainGo(r.v, r.ctx(), 1);
    r.at(6500);
    expect(r.result).toMatchObject({ winner: 'B', via: 'roulette' });
  });
  it('an AFK or absent Captain cannot press it; the crown can be reassigned', () => {
    const r = new Rig(4);
    r.vote(2, 'B');
    r.at(5000).roster2((x) => setConnected(x, 1, false, r.now));
    const before = core(r.v);
    r.v = captainGo(r.v, r.ctx(), 1);
    expect(core(r.v)).toEqual(before);
    r.roster2((x) => setCaptain(x, 2));
    r.v = captainGo(r.v, r.ctx(), 2);
    expect(r.snap().closing?.reason).toBe('captain');
  });
});

describe('keyboard has the last word', () => {
  it('closes at once with the chosen option, whatever the votes say', () => {
    const r = new Rig(4);
    r.vote(1, 'A').vote(2, 'A');
    r.v = keyboardPick(r.v, r.ctx(), 'C');
    expect(r.result).toMatchObject({ winner: 'C', reason: 'keyboard', via: 'keyboard', counts: { A: 2, B: 0, C: 0 } });
    expect(r.v.status).toBe('closed');
  });
  it('rejects an option outside the vote and does nothing on a closed vote', () => {
    const r = new Rig(2);
    const v0 = r.v;
    expect(keyboardPick(v0, r.ctx(), 'Z')).toBe(v0);
    r.v = cancel(r.v);
    expect(r.v.status).toBe('cancelled');
    expect(keyboardPick(r.v, r.ctx(), 'A')).toBe(r.v);
  });
});

describe('change and withdraw a vote', () => {
  it('tapping another option changes the vote; tapping your own withdraws it', () => {
    const r = new Rig(5);
    r.at(0).vote(1, 'A');
    r.at(1000).vote(1, 'B');
    expect(r.v.votes).toEqual({ 1: 'B' });
    r.at(2000).vote(1, 'B');
    expect(r.v.votes).toEqual({});
  });
  it('null withdraws; withdrawing with no vote does nothing', () => {
    const r = new Rig(5);
    const v0 = core(r.v);
    r.vote(1, null);
    expect(core(r.v)).toEqual(v0);
    r.vote(1, 'A').at(1000).vote(1, null);
    expect(r.v.votes).toEqual({});
  });
  it('250 ms cooldown per player (not across players)', () => {
    const r = new Rig(5);
    r.at(0).vote(1, 'A');
    r.at(249).vote(1, 'B');
    expect(r.v.votes[1]).toBe('A');
    r.vote(2, 'B');
    expect(r.v.votes[2]).toBe('B');
    r.at(250).vote(1, 'B');
    expect(r.v.votes[1]).toBe('B');
  });
  it('the only voter withdrawing cancels the clock and it restarts in full with the next vote', () => {
    const r = new Rig(5);
    r.at(0).vote(1, 'A');
    r.at(10_000).vote(1, null);
    expect(r.snap()).toMatchObject({ running: false, remainingMs: 15_000 });
    r.at(60_000);
    expect(r.v.status).toBe('open');
    r.vote(2, 'B');
    r.at(60_000 + 14_999);
    expect(r.v.status).toBe('open');
    r.at(60_000 + 15_000);
    expect(r.result?.winner).toBe('B');
  });
  it('withdrawing while others still vote keeps the clock', () => {
    const r = new Rig(5);
    r.at(0).vote(1, 'A').vote(2, 'B');
    r.at(10_000).vote(1, null);
    r.at(15_000);
    expect(r.result?.winner).toBe('B');
  });
  it('rejects a vote for another voteId or an unknown option', () => {
    const r = new Rig(5);
    r.vote(1, 'A', 'old').vote(1, 'Z');
    expect(r.v.votes).toEqual({});
  });
});
