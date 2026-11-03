import { describe, expect, it } from 'vitest';
import { createManchazo, hashManchazo } from '../../sim';
import { play } from '../match-drive';

const full = { sabotage: true, sabotagePlus: true, events: true, eventsPlus: true, living: true, classicMap: true } as const;

// Hashes taken on master (0ccdba5, PR1) with every flag on except `phases`, full rounds: the new flag off must not change a single bit.
describe('phases off: the round is the F8b one, bit for bit', () => {
  it.each([
    [{ slots: [0, 1, 2, 3, 4], teams: [0, 1, 0, 1, 1], seed: 21, mapSeed: 5150, ...full }, 2714580605, [186, 71], 5400],
    [{ slots: [0, 1, 2, 3, 4, 5, 6, 7], teams: [0, 1, 0, 1, 0, 1, 0, 1], seed: 33, mapSeed: 90210, ...full }, 133720667, [208, 98], 6300],
    [{ slots: [0, 1], teams: [0, 1], seed: 8, mapSeed: 777, ...full }, 3985694503, [72, 57], 4500],
  ] as const)('round %#', (cfg, hash, counts, ticks) => {
    const s = createManchazo(cfg);
    expect(s.match.ph).toBeNull();
    play(s, 5, 99999);
    expect(s.grid.tick).toBe(ticks);
    expect(hashManchazo(s)).toBe(hash);
    expect(s.match.counts).toEqual(counts);
  });
  it('with the flag on the same round really differs (its own act state, log and hash)', () => {
    const s = createManchazo({ slots: [0, 1], teams: [0, 1], seed: 8, mapSeed: 777, ...full, phases: true });
    play(s, 5, 99999);
    expect(s.match.ph).not.toBeNull();
    expect(hashManchazo(s)).not.toBe(3985694503);
    expect(s.match.ev!.log.filter((a) => /^(warn|phase)/.test(a.kind))).toHaveLength(4);
  });
  it('the flag needs `events`: without them no act state is built', () => {
    expect(createManchazo({ slots: [0, 1], teams: [0, 1], seed: 8, phases: true }).match.ph).toBeNull();
  });
});
