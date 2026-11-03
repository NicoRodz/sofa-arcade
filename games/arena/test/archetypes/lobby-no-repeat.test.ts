import { describe, expect, it } from 'vitest';
import { archetypeOf, mapSeedFor } from '../../map';

describe('the lobby re-draws a seed whose archetype repeats the round before', () => {
  it('never plays the same archetype twice in a row: 30 lobbies x 200 rounds, and the same lobby gives the same seeds', () => {
    for (let lobby = 1; lobby <= 30; lobby++) {
      const seeds = Array.from({ length: 200 }, (_, r) => mapSeedFor(lobby * 7919, r));
      for (let r = 1; r < seeds.length; r++) expect(archetypeOf(seeds[r]!), `lobby ${lobby} round ${r}`).not.toBe(archetypeOf(seeds[r - 1]!));
      expect(Array.from({ length: 200 }, (_, r) => mapSeedFor(lobby * 7919, r))).toEqual(seeds);
    }
  });
});
