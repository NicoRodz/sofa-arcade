import { defineProject, mergeConfig } from 'vitest/config';
import type { ViteUserConfig } from 'vitest/config';

// Shared test config: every project merges it. The 30 s global timeout and the catalog binding of vitest.setup.ts live here only.
export const sharedConfig: ViteUserConfig = { test: { testTimeout: 30000, setupFiles: ['./vitest.setup.ts'] } };

export const SLOW = '*.slow.test.ts';

// One project per package. `dirs` are the include roots; slow files (*.slow.test.ts) are left to the `slow` project.
// `isolate: false` (one module graph per worker instead of per file) only for packages whose tests hold no module or DOM state: see references/tests-rendimiento.md.
export function packageProject(name: string, dirs: string[], opts: { isolate?: boolean } = {}) {
  return mergeConfig(
    sharedConfig,
    defineProject({
      test: {
        name,
        ...(opts.isolate === false ? { isolate: false } : {}),
        include: dirs.map((d) => `${d}/**/*.test.ts`),
        exclude: ['**/node_modules/**', `**/${SLOW}`],
      },
    }),
  );
}

// `slow` tests are CPU-bound (sim, generators) or drive Chrome; with every core busy a 16 s test took 32 s and hit the 30 s default, so this project gets 120 s per test.
// The timeout only stops a hang: no assert changes.
export function slowProject(allDirs: string[]) {
  return mergeConfig(
    sharedConfig,
    defineProject({
      test: { name: 'slow', testTimeout: 120_000, include: allDirs.map((d) => `${d}/**/${SLOW}`), exclude: ['**/node_modules/**'] },
    }),
  );
}
