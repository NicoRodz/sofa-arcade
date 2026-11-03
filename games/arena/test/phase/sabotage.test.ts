import { describe, expect, it } from 'vitest';
import { PICKUP_RESPAWN_TICKS, FAST_RESPAWN_TICKS, createManchazo, openingTicks, pairOut, type ManchazoState } from '../../sim';
import { put } from '../match-drive';
import { idle, phaseRound, quietEvents, toTick } from './phase-drive';

const round = (extra = {}) => quietEvents(phaseRound([0, 1], 3, { sabotage: true, ...extra }));
const pairs = (s: ManchazoState) => [...new Set(s.match.sab!.pickups.map((p) => p.pair))].sort();
const stand = (s: ManchazoState, pair: number) => {
  const p = s.match.sab!.pickups.find((q) => q.pair === pair)!;
  put(s, 0, p.x, p.y);
  return p;
};

describe('sabotage pairs by act', () => {
  it('the map has three pairs; the Opening puts out one, the Scramble and the Final two', () => {
    const s = round();
    expect(pairs(s)).toEqual([0, 1, 2]);
    const out = () => pairs(s).filter((k) => pairOut(s.match, k));
    expect(out()).toEqual([0]);
    toTick(s, openingTicks(s.grid.durationTicks) + 1);
    expect(s.match.ph!.phase).toBe('scramble');
    expect(out()).toEqual([0, 1]);
    toTick(s, s.grid.durationTicks - 1000);
    expect(s.match.ph!.phase).toBe('final');
    expect(out()).toEqual([0, 1]);
  });
  it('a pickup of a pair that is not out cannot be taken (Opening), and can once its act comes', () => {
    const s = round();
    const p1 = stand(s, 1);
    idle(s, 3);
    expect(s.match.sab!.held[0]).toBeNull();
    expect(p1.wait).toBe(0);
    toTick(s, openingTicks(s.grid.durationTicks) + 1);
    stand(s, 1);
    idle(s);
    expect(s.match.sab!.held[0]).not.toBeNull();
  });
  it('a taken pickup comes back after 12 s in the Opening and 9 s (+33 % faster) after it', () => {
    expect(FAST_RESPAWN_TICKS * 4).toBe(PICKUP_RESPAWN_TICKS * 3);
    const s = round();
    const p0 = stand(s, 0);
    idle(s);
    expect(p0.wait).toBe(PICKUP_RESPAWN_TICKS - 1); // set in the tick's pickup step, burnt by one in the same step
    const late = round();
    toTick(late, openingTicks(late.grid.durationTicks) + 1);
    const q0 = stand(late, 0);
    idle(late);
    expect(q0.wait).toBe(FAST_RESPAWN_TICKS - 1);
  });
  it('without the flag every pair is always out and the respawn is 12 s', () => {
    const s = createManchazo({ slots: [0, 1], teams: [0, 1], seed: 3, sabotage: true, events: true });
    expect(s.match.ph).toBeNull();
    expect(pairs(s).every((k) => pairOut(s.match, k))).toBe(true);
    s.grid.tick = 2000;
    const p = stand(s, 2);
    idle(s);
    expect(p.wait).toBe(PICKUP_RESPAWN_TICKS - 1);
  });
});
