import { defineConfig } from 'vitest/config';
import { Plugin } from 'vite';
import path from 'path';

/**
 * resolveJsToTs: maps .js imports to .ts at test time
 * Required because TypeScript Node16 ESM requires explicit .js extensions,
 * but Vitest runs source .ts files directly.
 * Only applies to relative imports (./foo.js → ./foo.ts), not node_modules.
 */
function resolveJsToTs(): Plugin {
  return {
    name: 'resolve-js-to-ts',
    enforce: 'pre',
    resolveId(source, importer) {
      if (!importer) return null;
      // Only transform relative imports to avoid breaking node_modules lookups
      if (!source.startsWith('./') && !source.startsWith('../')) return null;
      if (!source.endsWith('.js')) return null;
      const tsPath = source.slice(0, -3) + '.ts';
      const resolved = path.resolve(path.dirname(importer), tsPath);
      return resolved;
    },
  };
}

export default defineConfig({
  plugins: [resolveJsToTs()],
  test: {
    environment: 'node',
    globals: false,
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
});
