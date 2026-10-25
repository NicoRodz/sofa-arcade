import { defineProject, mergeConfig } from 'vitest/config';
import type { ViteUserConfig } from 'vitest/config';

// Shared test config: every project merges it. The 30 s global timeout lives here only.
export const sharedConfig: ViteUserConfig = { test: { testTimeout: 30000 } };

export const SLOW = '*.slow.test.ts';

// One project per package. `dirs` are the include roots; slow files (*.slow.test.ts) are left to the `slow` project.
export function packageProject(name: string, dirs: string[]) {
  return mergeConfig(sharedConfig, defineProject({
    test: { name, include: dirs.map((d) => `${d}/**/*.test.ts`), exclude: ['**/node_modules/**', `**/${SLOW}`] },
  }));
}

export function slowProject(allDirs: string[]) {
  return mergeConfig(sharedConfig, defineProject({
    test: { name: 'slow', include: allDirs.map((d) => `${d}/**/${SLOW}`), exclude: ['**/node_modules/**'] },
  }));
}
