import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 30000,
    include: [
      'tests/**/*.test.ts',
      'benchmarks/**/__tests__/*.test.ts',
    ],
    exclude: ['node_modules', 'benchmarks/**/results/**'],
  },
});
