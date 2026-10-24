import { describe, expect, it } from 'vitest';
import { modeFor } from '../audio/music';

describe('music in the Cocina escuela', () => {
  it('is the lobby\'s calm music, not silence (the school has no countdown) and not the rush of a match', () => {
    expect(modeFor({ phase: 'school', started: false, timeLeftMs: null })).toBe('lobby');
    expect(modeFor({ phase: 'school', started: true, timeLeftMs: 1000 })).toBe('lobby');
  });
});
