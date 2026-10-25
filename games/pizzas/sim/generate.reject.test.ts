import { describe, expect, it, vi } from 'vitest';

vi.mock('./validate', async (orig) => ({
  ...(await orig<typeof import('./validate')>()),
  validate: () => ({ ok: false, errors: ['forced'] }),
  validateMap: () => ({ ok: false, errors: ['forced'] }),
}));

describe('generate with a validator that rejects everything', () => {
  it('never returns a candidate: it falls back to the first fixed map of the difficulty', async () => {
    const { generate } = await import('./generate');
    const g = generate(5, 'normal', 2);
    expect(g.archetype).toBe('fixed');
    expect(g.attempts).toBe(200);
  });
});
