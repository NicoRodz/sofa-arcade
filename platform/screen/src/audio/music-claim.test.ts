import { describe, expect, it } from 'vitest';
import { claimMusic, musicClaimed, phaseFor } from './music-claim';

describe('music claim', () => {
  it('nothing is claimed until a game claims it', () => {
    expect(musicClaimed('claim-test-a')).toBe(false);
    expect(phaseFor('lobby', 'claim-test-a', 'pizzas')).toBe('lobby');
  });
  it('a claimed game keeps the default music out of its lobby and results only', () => {
    claimMusic('claim-test-b');
    expect(phaseFor('lobby', 'claim-test-b', 'pizzas')).toBe('playing');
    expect(phaseFor('results', 'claim-test-b', 'pizzas')).toBe('playing');
    expect(phaseFor('menu', 'claim-test-b', 'pizzas')).toBe('menu');
    expect(phaseFor('playing', 'claim-test-b', 'pizzas')).toBe('playing');
  });
  it('the owner of the music always sees its own phase', () => {
    claimMusic('claim-test-c');
    expect(phaseFor('lobby', 'claim-test-c', 'claim-test-c')).toBe('lobby');
  });
});
