import { describe, expect, it } from 'vitest';
import { createManchazo, hashManchazo } from '../../sim';
import { play } from '../match-drive';

// Hashes taken on master (9930e93, before F3): a round without the flag must not change by a single bit.
describe('sabotage flag off: the round is F1/F2, bit for bit', () => {
  it.each([
    [7, undefined, 1748725922, [77, 95]],
    [9, 123456, 774602940, [75, 145]],
  ] as const)('seed %i map %s', (seed, mapSeed, hash, counts) => {
    const s = createManchazo({ slots: [0, 1, 2, 3, 4], teams: [0, 1, 0, 1, 1], seed, ...(mapSeed ? { mapSeed } : {}) });
    expect(s.match.sab).toBeNull();
    play(s, 5, 2400);
    expect(hashManchazo(s)).toBe(hash);
    expect(s.match.counts).toEqual(counts);
  });
});
