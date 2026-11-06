import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../rng';
import { addPlayer, majorityOf, removePlayer, setConnected } from './vote';
import { Rig } from './vote.kit';

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
