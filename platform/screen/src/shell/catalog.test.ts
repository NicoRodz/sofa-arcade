import { beforeEach, describe, expect, it, vi } from 'vitest';

// vitest.setup.ts binds the catalog for every test file; a fresh module registry gives each test an unbound shell, as a main.ts that forgot its first import would see.
describe('shell catalog binding', () => {
  beforeEach(() => vi.resetModules());

  it('throws a clear error when read before the composition root binds it', async () => {
    const shell = await import('./catalog');
    expect(() => shell.catalog()).toThrow(/no game catalog bound/);
    expect(() => shell.defaultConfig()).toThrow(/no game catalog bound/);
  });

  it('returns what was bound', async () => {
    const shell = await import('./catalog');
    const { CATALOG, DEFAULT_CONFIG } = await import('@pichi/catalog');
    shell.bindCatalog(CATALOG, DEFAULT_CONFIG);
    expect(shell.catalog()).toBe(CATALOG);
    expect(shell.defaultConfig()).toBe(DEFAULT_CONFIG);
  });
});
