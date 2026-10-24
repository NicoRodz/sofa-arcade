import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { include: ['shared/**/*.test.ts', 'screen/src/**/*.test.ts', 'server/test/**/*.test.ts', 'screen/test/**/*.test.ts', 'controller/src/**/*.test.ts', 'controller/test/**/*.test.ts'] } });
