import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 120000,
    hookTimeout: 60000,
    include: ['**/*.test.ts'],
    reporters: ['verbose'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      reportsDirectory: './coverage/e2e-ui',
    },
    sequence: {
      concurrent: false, // Run tests sequentially for stability
    },
  },
});
