import { describe, expect, it } from 'vitest';
import { createManchazo, hashManchazo } from '../../sim';
import { play } from '../match-drive';

// Hashes taken on master (b367f39, before F4) with the sabotages on: a round without the events flag must not change by a single bit.
describe('events flag off: the round is F3, bit for bit', () => {
  it.each([
    [7, undefined, 931750987, [153, 157]],
    [9, 123456, 2039021274, [124, 180]],
  ] as const)('seed %i map %s', (seed, mapSeed, hash, counts) => {
    const s = createManchazo({
      slots: [0, 1, 2, 3, 4],
      teams: [0, 1, 0, 1, 1],
      seed,
      sabotage: true,
      ...(mapSeed ? { mapSeed, classicMap: true } : {}),
    });
    expect(s.match.ev).toBeNull();
    play(s, 5, 4500);
    expect(hashManchazo(s)).toBe(hash);
    expect(s.match.counts).toEqual(counts);
  });
  it('with the flag on the round really differs (its program, announcements and hash)', () => {
    const s = createManchazo({ slots: [0, 1, 2, 3, 4], teams: [0, 1, 0, 1, 1], seed: 7, sabotage: true, events: true });
    play(s, 5, 4500);
    expect(s.match.ev!.log.length).toBeGreaterThanOrEqual(3);
    expect(hashManchazo(s)).not.toBe(931750987);
  });
});
