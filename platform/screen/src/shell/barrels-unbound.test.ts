import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Phaser touches `window` while loading and has nothing to do with the catalog: a Proxy stands in for it so the barrels evaluate in node.
vi.mock('phaser', () => {
  const stand: unknown = new Proxy(() => {}, {
    get: (_t, k) => (k === 'then' ? undefined : stand),
    apply: () => stand,
    construct: () => ({}),
  });
  return { default: stand };
});

// The composition root binds the catalog from its own first import, but a barrel can be evaluated before that line runs (apps/screen/src/catalog.ts imports
// bindCatalog from the shell barrel itself). Loading any barrel of platform/screen with no catalog bound must therefore never throw: catalog reads are lazy.
const BARRELS = [
  '@pichi/screen-kit/shell',
  '@pichi/screen-kit',
  '@pichi/screen-kit/art',
  '@pichi/screen-kit/audio',
  '@pichi/screen-kit/lobby',
  '@pichi/screen-kit/menu/index',
  '@pichi/screen-kit/net',
  '@pichi/screen-kit/results',
  '@pichi/screen-kit/screens',
  '@pichi/screen-kit/ui',
  '@pichi/screen-kit/vote',
];

describe('screen-kit barrels without a bound catalog', () => {
  // vitest.setup.ts binds the catalog for every file; a fresh module registry gives each import an unbound shell.
  beforeEach(() => {
    vi.resetModules();
    // the shell reads the room from the page while loading; the suite runs in node, so give it a bare page
    vi.stubGlobal('location', { search: '' });
    vi.stubGlobal('sessionStorage', { getItem: () => null, setItem: () => {} });
  });
  afterEach(() => vi.unstubAllGlobals());

  it.each(BARRELS)('%s loads without throwing', async (barrel) => {
    await expect(import(/* @vite-ignore */ barrel)).resolves.toBeDefined();
  });

  it('reads the catalog on first use of app.config, not at load', async () => {
    const shell = await import('@pichi/screen-kit/shell');
    const { CATALOG, DEFAULT_CONFIG } = await import('@pichi/catalog');
    expect(() => shell.app.config).toThrow(/no game catalog bound/);
    shell.bindCatalog(CATALOG, DEFAULT_CONFIG);
    expect(shell.app.config.game).toBe(DEFAULT_CONFIG.game);
  });
});
