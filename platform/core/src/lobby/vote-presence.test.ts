import { describe, expect, it } from 'vitest';
import {
  AFK_IDLE_MS,
  addPlayer,
  cast,
  clearVotes,
  dependentKeys,
  eligible,
  makeRoster,
  openVote,
  recordParticipation,
  setConnected,
  tick,
  tickAfk,
  touch,
  type OptionSpec,
} from './vote';
import { core, Rig } from './vote.kit';

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
