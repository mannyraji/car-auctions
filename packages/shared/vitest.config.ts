import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/index.ts'],
      thresholds: {
        branches: 80,
        functions: 80,
        lines: 80,
        statements: 80,
      },
    },
  },
  plugins: [
    // Rewrites .js imports to .ts for vitest (Node16 ESM source compatibility)
    {
      name: 'rewrite-ts-js-imports',
      resolveId(id: string, importer: string | undefined) {
        // Only rewrite relative imports with .js extension
        if (importer && id.startsWith('.') && id.endsWith('.js')) {
          // Return the .ts version — Vite/Vitest will find the actual file
          return id.replace(/\.js$/, '.ts');
        }
        return undefined;
      },
    },
  ],
  resolve: {
    conditions: ['node'],
  },
});
