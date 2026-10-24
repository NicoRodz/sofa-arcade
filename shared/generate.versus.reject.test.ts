import { describe, expect, it, vi } from 'vitest';

// A versus validator that rejects the first `reject` candidates (then judges as usual), to see the bounded retry at work.
let calls = 0, reject = 0;
vi.mock('./validate', async (orig) => {
  const real = await orig<typeof import('./validate')>();
  return { ...real, validateVersus: (...args: Parameters<typeof real.validateVersus>) => (++calls <= reject ? { ...real.validateVersus(...args), ok: false, errors: ['forced'] } : real.validateVersus(...args)) };
});

describe('generateVersus: retries', () => {
  it('a rejected candidate is retried with the same stream: 3 rejections give the 4th attempt, still valid and not a fallback', async () => {
    const { generateVersus } = await import('./generate');
    const { validateVersus } = await import('./validate');
    calls = 0; reject = 0;
    const clean = generateVersus(11, 'normal', 6);
    expect(clean.attempts).toBe(1);
    calls = 0; reject = 3;
    const g = generateVersus(11, 'normal', 6);
    expect(g.attempts).toBe(4);
    expect(g.fallback).toBe(false);
    expect(g.rows).not.toEqual(clean.rows); // the retry draws another candidate
    reject = 0;
    expect(validateVersus({ id: 'g', name: 'g', rows: g.rows, nMin: g.nMin, nMax: g.nMax, minDuro: 2, stars: 2, versus: { sigma: g.sigma, spawns: g.spawns } }).ok).toBe(true);
  });

  it('when every candidate is rejected the attempts are bounded and a fixed map comes back', async () => {
    const { generateVersus, MAX_ATTEMPTS } = await import('./generate');
    calls = 0; reject = Infinity;
    const g = generateVersus(5, 'hard', 4);
    expect(g.fallback).toBe(true);
    expect(g.attempts).toBe(MAX_ATTEMPTS);
    expect(calls).toBe(MAX_ATTEMPTS); // exactly one validation per attempt, no more
  });
});
