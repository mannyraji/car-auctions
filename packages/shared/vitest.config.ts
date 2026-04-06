import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/index.ts',
        'src/types/index.ts',
        // Wrapper files that depend on external services (Playwright, MCP SDK)
        // and require integration tests rather than unit tests
        'src/browser-pool.ts',
        'src/mcp-helpers.ts',
      ],
      thresholds: {
        branches: 80,
      },
    },
  },
});
