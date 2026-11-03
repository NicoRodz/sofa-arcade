import { describe, expect, it } from 'vitest';
import { createManchazo, hashManchazo } from '../../sim';
import { ManchazoRun } from '../../screen/match/run';
import { play } from '../match-drive';

const full = { sabotage: true, sabotagePlus: true, events: true, eventsPlus: true, living: true, classicMap: true, phases: true } as const;

// Re-pinned for the fluid-turn movement (the flag-off bits are the new base movement). Originally taken on master (6f9d231, PR2) with every flag on, full rounds: the new flag off must not change a single bit.
describe('rescue off: the round is the PR2 one, bit for bit', () => {
  it.each([
    [{ slots: [0, 1, 2, 3, 4], teams: [0, 1, 0, 1, 1], seed: 21, mapSeed: 5150, ...full }, 4045091785, [111, 187], 5400],
    [{ slots: [0, 1, 2, 3, 4, 5, 6, 7], teams: [0, 1, 0, 1, 0, 1, 0, 1], seed: 33, mapSeed: 90210, ...full }, 1188966170, [174, 131], 6300],
    [{ slots: [0, 1], teams: [0, 1], seed: 8, mapSeed: 777, ...full }, 3941163731, [76, 61], 4500],
  ] as const)('round %#', (cfg, hash, counts, ticks) => {
    const s = createManchazo(cfg);
    expect(s.match.res).toBeNull();
    play(s, 5, 99999);
    expect(s.grid.tick).toBe(ticks);
    expect(hashManchazo(s)).toBe(hash);
    expect(s.match.counts).toEqual(counts);
  });
  it('with the flag on the same round really differs (its own state and hash)', () => {
    const s = createManchazo({
      slots: [0, 1, 2, 3, 4, 5, 6, 7],
      teams: [0, 1, 0, 1, 0, 1, 0, 1],
      seed: 33,
      mapSeed: 90210,
      ...full,
      rescue: true,
    });
    play(s, 5, 99999);
    expect(s.match.res).not.toBeNull();
    expect(hashManchazo(s)).not.toBe(1188966170);
  });
  it('the flag needs nothing else: without sabotages the rescue still plays and no loot exists', () => {
    const s = createManchazo({ slots: [0, 1], teams: [0, 1], seed: 8, rescue: true });
    expect(s.match.res).not.toBeNull();
    expect(s.match.sab).toBeNull();
  });
  it('the TV turns the flag on (ManchazoRun)', () => {
    expect(new ManchazoRun([0, 1], [0, 1], 8, 777).state.match.res).not.toBeNull();
  });
});
