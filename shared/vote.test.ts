import { describe, expect, it } from 'vitest';
import { mulberry32 } from './rng';
import {
  AFK_IDLE_MS,
  addPlayer,
  cancel,
  cast,
  captainCancel,
  captainGo,
  clearVotes,
  dependentKeys,
  eligible,
  keyboardPick,
  majorityOf,
  makeRoster,
  openVote,
  recordParticipation,
  removePlayer,
  setCaptain,
  setConnected,
  settle,
  snapshot,
  tick,
  tickAfk,
  touch,
  type OptionSpec,
  type Roster,
  type VoteConfig,
  type VoteState,
} from './vote';

// Fake clock harness: `now` only moves when the test says so. Players 1..n sit, player 1 is the Captain.
const core = (v: VoteState) => ({ votes: v.votes, closing: v.closing, status: v.status, result: v.result }); // an ignored action may only move the tick time

class Rig {
  now = 0;
  roster: Roster;
  v: VoteState;
  rng: () => number = () => 0;
  constructor(n: number, cfg: Partial<VoteConfig> = {}) {
    this.roster = makeRoster(
      Array.from({ length: n }, (_x, i) => i + 1),
      0,
    );
    this.v = openVote({ voteId: 'v1', kind: 'pick', options: ['A', 'B', 'C'], windowMs: 15_000, ...cfg }, 0);
  }
  ctx() {
    return { now: this.now, rng: this.rng, roster: this.roster };
  }
  at(ms: number) {
    this.now = ms;
    this.v = tick(this.v, this.ctx());
    return this;
  }
  advance(ms: number) {
    return this.at(this.now + ms);
  }
  vote(p: number, o: string | null, id: string | number = 'v1') {
    this.v = cast(this.v, this.ctx(), p, id, o);
    return this;
  }
  roster2(f: (r: Roster) => Roster) {
    this.v = tick(this.v, this.ctx());
    this.roster = f(this.roster);
    this.v = tick(this.v, this.ctx());
    return this;
  }
  snap() {
    return snapshot(this.v, this.ctx());
  }
  get result() {
    return this.v.result;
  }
}

describe('threshold M and E (section 2: eligibles)', () => {
  it('M = floor(E/2)+1', () => {
    expect([0, 1, 2, 3, 4, 5, 8].map(majorityOf)).toEqual([1, 1, 2, 2, 3, 3, 5]);
  });
  it('E counts only seated, connected, non-AFK players; M follows', () => {
    const r = new Rig(5);
    expect(r.snap()).toMatchObject({ E: 5, M: 3 });
    r.roster2((x) => setConnected(x, 5, false, r.now));
    expect(r.snap()).toMatchObject({ E: 4, M: 3 });
    r.roster2((x) => removePlayer(x, 4));
    expect(r.snap()).toMatchObject({ E: 3, M: 2 });
  });
  it('a spectator (not in the roster) cannot vote', () => {
    const r = new Rig(3);
    r.vote(99, 'A');
    expect(r.v.votes).toEqual({});
  });
});

describe('passive majority: whoever does not vote does not count', () => {
  it('with 5 eligible and a single voter, the deadline closes with that vote', () => {
    const r = new Rig(5);
    r.at(1000).vote(2, 'B');
    r.at(1000 + 14_999);
    expect(r.v.status).toBe('open');
    r.at(1000 + 15_000);
    expect(r.result).toMatchObject({ winner: 'B', reason: 'deadline', via: 'plurality' });
  });
});

describe('the clock starts at the first vote', () => {
  it('does not run before any vote, however long they look at the options', () => {
    const r = new Rig(3);
    r.at(60_000);
    expect(r.v.status).toBe('open');
    expect(r.snap()).toMatchObject({ remainingMs: 15_000, running: false });
  });
  it('runs from the first vote and the remaining time is reported', () => {
    const r = new Rig(5);
    r.at(10_000).vote(1, 'A');
    r.advance(4_000);
    expect(r.snap().remainingMs).toBe(11_000);
  });
  it('a later vote does not restart it', () => {
    const r = new Rig(5);
    r.at(0).vote(1, 'A');
    r.at(10_000).vote(2, 'B');
    r.at(15_000);
    expect(r.v.status).toBe('closed');
  });
});

describe('early close: everyone voted (1.5 s grace to correct)', () => {
  it('closes 1.5 s after the last vote, not before', () => {
    const r = new Rig(4);
    r.at(0).vote(1, 'A').vote(2, 'B').vote(3, 'A');
    r.at(500).vote(4, 'B'); // 2-2, all voted
    expect(r.snap().closing).toMatchObject({ reason: 'all', inMs: 1500 });
    r.at(1999);
    expect(r.v.status).toBe('open');
    r.at(2000);
    expect(r.v.status).toBe('closed');
    expect(r.result?.reason).toBe('all');
  });
  it('a correction during the grace is accepted', () => {
    const r = new Rig(4);
    r.vote(1, 'A').vote(2, 'B').vote(3, 'A');
    r.at(500).vote(4, 'B');
    r.at(1000).vote(2, 'A'); // now A has 3 = M: the closing becomes "majority" and its grace starts again
    r.at(2000);
    expect(r.v.status).toBe('open');
    r.at(2500);
    expect(r.result).toMatchObject({ winner: 'A', reason: 'majority' });
  });
  it('a vote withdrawn during the grace cancels it (not everyone has voted anymore)', () => {
    const r = new Rig(3);
    r.vote(1, 'A').vote(2, 'B');
    r.at(500).vote(3, 'C');
    expect(r.snap().closing?.reason).toBe('all');
    r.at(1000).vote(3, null);
    expect(r.snap().closing).toBeNull();
    r.at(5000);
    expect(r.v.status).toBe('open');
  });
  it('the player that disconnects without voting can complete "all voted"', () => {
    const r = new Rig(3);
    r.vote(1, 'A').vote(2, 'B');
    expect(r.snap().closing).toBeNull();
    r.at(1000).roster2((x) => setConnected(x, 3, false, r.now));
    expect(r.snap().closing?.reason).toBe('all');
  });
});

describe('early close: an option reaches M ("Gana X en 1,5")', () => {
  it('announces the winner and closes after the grace, with not everyone having voted', () => {
    const r = new Rig(5);
    r.at(0).vote(1, 'A').vote(2, 'A');
    expect(r.snap().closing).toBeNull();
    r.at(300).vote(3, 'A');
    expect(r.snap().closing).toMatchObject({ reason: 'majority', option: 'A', inMs: 1500 });
    r.at(1799);
    expect(r.v.status).toBe('open');
    r.at(1800);
    expect(r.result).toMatchObject({ winner: 'A', reason: 'majority' });
  });
  it('cancels if the option falls below M during the grace', () => {
    const r = new Rig(5);
    r.vote(1, 'A').vote(2, 'A');
    r.at(300).vote(3, 'A');
    r.at(1000).vote(3, null);
    expect(r.snap().closing).toBeNull();
    r.at(10_000);
    expect(r.v.status).toBe('open');
    r.at(15_000);
    expect(r.result).toMatchObject({ winner: 'A', reason: 'deadline' });
  });
  it('does not restart the grace while the same option keeps M', () => {
    const r = new Rig(5);
    r.vote(1, 'A').vote(2, 'A');
    r.at(300).vote(3, 'A');
    r.at(1000).vote(4, 'A');
    r.at(1800);
    expect(r.v.status).toBe('closed');
  });
  it('a player joining mid-grace raises M and can cancel the closing', () => {
    const r = new Rig(3); // M = 2
    r.vote(1, 'A').vote(2, 'A');
    expect(r.snap().closing?.reason).toBe('majority');
    r.at(500).roster2((x) => addPlayer(addPlayer(x, 4, r.now), 5, r.now)); // E=5, M=3
    expect(r.snap().closing).toBeNull();
  });
});

describe('deadline: plurality among the votes cast', () => {
  it('wins the option with most votes even without absolute majority', () => {
    const r = new Rig(8);
    r.at(0).vote(1, 'A').vote(2, 'A').vote(3, 'B');
    r.at(15_000);
    expect(r.result).toMatchObject({ winner: 'A', reason: 'deadline', via: 'plurality', counts: { A: 2, B: 1, C: 0 } });
  });
  it('a vote at the exact deadline is rejected (the vote is already closed)', () => {
    const r = new Rig(8);
    r.at(0).vote(1, 'A');
    r.at(15_000).vote(2, 'B');
    expect(r.result?.winner).toBe('A');
    expect(r.v.votes).toEqual({ 1: 'A' });
  });
  it('the late vote cannot reopen a closed vote', () => {
    const r = new Rig(2);
    r.vote(1, 'A').vote(2, 'A');
    r.at(1500);
    const closed = r.v;
    r.at(2000).vote(1, 'B');
    expect(r.v).toBe(closed);
  });
});

describe('tie: roulette with a fixed seed', () => {
  it('draws among the tied options only, same seed -> same winner', () => {
    const run = (seed: number) => {
      const r = new Rig(4);
      r.rng = mulberry32(seed);
      r.vote(1, 'A').vote(2, 'B').vote(3, 'C').vote(4, 'C');
      r.at(300).vote(3, null).vote(4, null); // 1-1-0
      r.at(15_000);
      return r.result!;
    };
    const first = run(42);
    expect(first.via).toBe('roulette');
    expect(first.roulette).toEqual({ candidates: ['A', 'B'], ms: 1500 });
    expect(run(42)).toEqual(first);
    const winners = new Set(Array.from({ length: 30 }, (_x, i) => run(i + 1).winner));
    expect(winners).toEqual(new Set(['A', 'B'])); // never C, both reachable
  });
  it('the draw is the injected RNG: 0 -> first tied option, 0.99 -> last', () => {
    for (const [value, expected] of [
      [0, 'A'],
      [0.99, 'C'],
    ] as const) {
      const r = new Rig(3);
      r.rng = () => value;
      r.vote(1, 'A').vote(2, 'B').vote(3, 'C'); // 3-way tie, all voted
      r.at(1500);
      expect(r.result).toMatchObject({ winner: expected, via: 'roulette' });
      expect(r.result?.roulette?.candidates).toEqual(['A', 'B', 'C']);
    }
  });
  it('no roulette without a tie', () => {
    const r = new Rig(3);
    r.vote(1, 'A').vote(2, 'A').vote(3, 'B');
    r.at(1500);
    expect(r.result?.via).not.toBe('roulette');
    expect(r.result?.roulette).toBeUndefined();
  });
});

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

describe('AFK', () => {
  it('90 s without input -> AFK, out of E; any touch reactivates', () => {
    const r = new Rig(3);
    r.roster = touch(r.roster, 2, 50_000);
    r.roster = tickAfk(r.roster, AFK_IDLE_MS - 1);
    expect(eligible(r.roster)).toEqual([1, 2, 3]);
    r.roster = tickAfk(r.roster, AFK_IDLE_MS);
    expect(eligible(r.roster)).toEqual([2]); // 1 and 3 idle since 0
    r.roster = touch(r.roster, 3, AFK_IDLE_MS + 1);
    expect(eligible(r.roster)).toEqual([2, 3]);
    r.roster = tickAfk(r.roster, AFK_IDLE_MS + 5);
    expect(eligible(r.roster)).toEqual([2, 3]);
  });
  it('an AFK player leaves E mid-vote and can complete "all voted"; their vote is suspended and returns on touch', () => {
    const r = new Rig(3);
    r.at(0).vote(3, 'C');
    r.at(1000).vote(1, 'A');
    r.roster2((x) => ({ ...x, players: { ...x.players, 3: { ...x.players[3]!, afk: true } } }));
    expect(r.snap()).toMatchObject({ E: 2, voted: 1, counts: { A: 1, C: 0 } });
    r.vote(3, 'B'); // AFK cannot cast until touched
    expect(r.v.votes[3]).toBe('C');
    r.roster2((x) => touch(x, 3, r.now));
    expect(r.snap()).toMatchObject({ E: 3, counts: { A: 1, C: 1 } });
  });
  it('two votes in a row without voting -> AFK; voting in between resets the count', () => {
    let roster = makeRoster([1, 2, 3], 0);
    const closeVote = (voters: Record<number, string>) => {
      const rig = new Rig(3);
      rig.roster = roster;
      for (const [p, o] of Object.entries(voters)) rig.vote(Number(p), o);
      rig.at(15_000);
      roster = recordParticipation(roster, rig.v);
    };
    closeVote({ 1: 'A', 2: 'A' });
    expect(roster.players[3]).toMatchObject({ missed: 1, afk: false });
    closeVote({ 1: 'A', 2: 'A', 3: 'B' });
    expect(roster.players[3]).toMatchObject({ missed: 0, afk: false });
    closeVote({ 1: 'A', 2: 'A' });
    closeVote({ 1: 'A', 2: 'A' });
    expect(roster.players[3]).toMatchObject({ missed: 2, afk: true });
    expect(eligible(roster)).toEqual([1, 2]);
    roster = touch(roster, 3, 20_000);
    expect(roster.players[3]).toMatchObject({ afk: false, missed: 0 });
  });
  it('recordParticipation ignores votes that are not closed', () => {
    const r = new Rig(2);
    expect(recordParticipation(r.roster, r.v)).toBe(r.roster);
  });
});

describe('disconnect and return', () => {
  it('leaves E at once; the vote is suspended and counts again if they come back before the close (same voteId)', () => {
    const r = new Rig(5);
    r.at(0).vote(1, 'A').vote(2, 'A');
    r.at(1000).roster2((x) => setConnected(x, 2, false, r.now));
    expect(r.snap()).toMatchObject({ E: 4, counts: { A: 1 }, voted: 1 });
    expect(r.v.votes[2]).toBe('A');
    r.at(5000).roster2((x) => setConnected(x, 2, true, r.now));
    expect(r.snap()).toMatchObject({ E: 5, counts: { A: 2 } });
  });
  it('the deadline does not extend with the reconnection', () => {
    const r = new Rig(3);
    r.at(0).vote(1, 'A');
    r.at(5000).roster2((x) => setConnected(x, 2, false, r.now));
    r.at(10_000).roster2((x) => setConnected(x, 2, true, r.now));
    expect(r.snap().remainingMs).toBe(5000);
    r.at(15_000);
    expect(r.v.status).toBe('closed');
  });
  it('the disconnected vote reaching M while away does not count: the majority is only among the connected', () => {
    const r = new Rig(3);
    r.vote(1, 'A').vote(2, 'A');
    r.at(100).roster2((x) => setConnected(setConnected(x, 1, false, r.now), 2, false, r.now));
    expect(r.snap()).toMatchObject({ E: 1, counts: { A: 0 }, closing: null });
  });
  it('a different voteId is a different vote: the old votes do not carry over', () => {
    const r = new Rig(3);
    r.vote(1, 'A');
    const next = openVote({ voteId: 'v2', kind: 'pick', options: ['A', 'B'], windowMs: 15_000 }, 5000);
    expect(next.votes).toEqual({});
    expect(core(cast(next, r.ctx(), 1, 'v1', 'A'))).toEqual(core(next)); // stale voteId ignored
  });
  it('the disconnected vote of the only voter keeps the clock running; at the deadline nobody counts -> empty', () => {
    const r = new Rig(2);
    r.at(0).vote(1, 'A');
    r.at(1000).roster2((x) => setConnected(x, 1, false, r.now));
    r.at(15_000);
    expect(r.result).toMatchObject({ winner: null, via: 'empty' });
  });
});

describe('joining mid-vote', () => {
  it('a new seated player is eligible at once and raises E and M', () => {
    const r = new Rig(2);
    r.at(0).vote(1, 'A');
    r.at(2000).roster2((x) => addPlayer(x, 3, r.now));
    expect(r.snap()).toMatchObject({ E: 3, M: 2, waiting: [2, 3] });
    r.vote(3, 'B');
    expect(r.v.votes[3]).toBe('B');
  });
  it('a newcomer voting last completes "all voted"', () => {
    const r = new Rig(2);
    r.vote(1, 'A').vote(2, 'A'); // majority 2/2 closing already
    const q = new Rig(2);
    q.vote(1, 'A').vote(2, 'B');
    q.at(1000).roster2((x) => addPlayer(x, 3, q.now)); // all-voted closing cancelled by the newcomer
    expect(q.snap().closing).toBeNull();
    q.vote(3, 'A');
    expect(q.snap().closing).toMatchObject({ reason: 'majority', option: 'A' });
  });
});

describe('edge cases E=1 and E=0', () => {
  it('E=1: every tap closes in 1.5 s (remote control)', () => {
    const r = new Rig(1);
    r.at(0).vote(1, 'B');
    expect(r.snap()).toMatchObject({ E: 1, M: 1, closing: { reason: 'majority', option: 'B', inMs: 1500 } });
    r.at(1500);
    expect(r.result).toMatchObject({ winner: 'B', via: 'plurality' });
  });
  it('E=1: a tap on another option within the grace changes the result', () => {
    const r = new Rig(1);
    r.at(0).vote(1, 'B');
    r.at(300).vote(1, 'C');
    r.at(1800);
    expect(r.result?.winner).toBe('C');
  });
  it('E=0: the clock freezes (does not reset, does not run) and nothing closes', () => {
    const r = new Rig(2);
    r.at(0).vote(1, 'A');
    r.at(4000).roster2((x) => setConnected(setConnected(x, 1, false, r.now), 2, false, r.now));
    expect(r.snap()).toMatchObject({ E: 0, running: false, remainingMs: 11_000, closing: null });
    r.at(10 * 60_000);
    expect(r.v.status).toBe('open');
    expect(r.snap().remainingMs).toBe(11_000);
  });
  it('E=0 then someone returns: the clock resumes from where it froze', () => {
    const r = new Rig(3);
    r.at(0).vote(1, 'A');
    r.at(4000).roster2((x) => setConnected(setConnected(setConnected(x, 1, false, r.now), 2, false, r.now), 3, false, r.now));
    r.at(100_000).roster2((x) => setConnected(x, 2, true, r.now)); // player 2 (no vote) returns: E=1, no closing
    expect(r.snap().remainingMs).toBe(11_000);
    r.at(100_000 + 10_999);
    expect(r.v.status).toBe('open');
    r.at(100_000 + 11_000);
    expect(r.v.status).toBe('closed');
  });
  it('E=0 cancels a running closing', () => {
    const r = new Rig(1);
    r.vote(1, 'A');
    expect(r.snap().closing).not.toBeNull();
    r.at(500).roster2((x) => setConnected(x, 1, false, r.now));
    expect(r.snap().closing).toBeNull();
  });
});

describe('item reset and schema', () => {
  it('clearVotes drops votes and the clock', () => {
    const r = new Rig(3);
    r.at(0).vote(1, 'A');
    r.at(5000);
    r.v = clearVotes(r.v, r.now);
    expect(r.v.votes).toEqual({});
    expect(r.snap()).toMatchObject({ running: false, remainingMs: 15_000 });
  });
  it('dependentKeys is transitive and ignores unrelated keys', () => {
    const spec = (key: string, parent?: string): OptionSpec => ({
      key,
      label: key,
      type: 'enum',
      values: [],
      default: '',
      votable: true,
      parent,
    });
    const specs = [spec('mode'), spec('map', 'mode'), spec('seed', 'map'), spec('level')];
    expect(dependentKeys(specs, 'mode')).toEqual(['map', 'seed']);
    expect(dependentKeys(specs, 'level')).toEqual([]);
  });
});

describe('immutability', () => {
  it('actions never mutate the previous state', () => {
    const r = new Rig(3);
    const v0 = r.v;
    const frozen = JSON.stringify(v0);
    const v1 = cast(v0, r.ctx(), 1, 'v1', 'A');
    tick(v1, { ...r.ctx(), now: 99_999 });
    expect(JSON.stringify(v0)).toBe(frozen);
    expect(v1).not.toBe(v0);
  });
});
