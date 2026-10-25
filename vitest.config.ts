import { defineConfig } from 'vitest/config';
import { packageProject, slowProject } from './vitest.shared.ts';

// Packages and where their tests live. `npm test` runs everything; `test:fast` skips `slow`.
const packages = {
  shared: ['shared'],
  server: ['server/test', 'server/src'],
  screen: ['screen/src', 'screen/test'],
  controller: ['controller/src', 'controller/test'],
  tools: ['tools'],
};

export default defineConfig({
  test: {
    projects: [...Object.entries(packages).map(([name, dirs]) => packageProject(name, dirs)), slowProject(Object.values(packages).flat())],
  },
});
