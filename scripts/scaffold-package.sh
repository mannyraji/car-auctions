#!/usr/bin/env bash
# scaffold-package.sh — Bootstrap a new MCP server package in the monorepo.
# Usage: ./scripts/scaffold-package.sh <package-name>
# Example: ./scripts/scaffold-package.sh copart-scraper-mcp

set -euo pipefail

PACKAGE_NAME="${1:-}"

if [[ -z "$PACKAGE_NAME" ]]; then
  echo "Usage: $0 <package-name>" >&2
  echo "Example: $0 copart-scraper-mcp" >&2
  exit 1
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PKG_DIR="$ROOT_DIR/packages/$PACKAGE_NAME"

if [[ -d "$PKG_DIR" ]]; then
  echo "Error: $PKG_DIR already exists." >&2
  exit 1
fi

echo "Scaffolding package: @car-auctions/$PACKAGE_NAME"

# --- Directory structure ---
mkdir -p \
  "$PKG_DIR/src/tools" \
  "$PKG_DIR/src/scraper" \
  "$PKG_DIR/src/cache" \
  "$PKG_DIR/src/utils" \
  "$PKG_DIR/src/types" \
  "$PKG_DIR/config" \
  "$PKG_DIR/tests/fixtures" \
  "$PKG_DIR/data"

touch "$PKG_DIR/data/.gitkeep"

# --- package.json ---
cat > "$PKG_DIR/package.json" <<EOF
{
  "name": "@car-auctions/$PACKAGE_NAME",
  "version": "0.1.0",
  "description": "$PACKAGE_NAME MCP server",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "engines": {
    "node": ">=20"
  },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc --noEmit -p tsconfig.json",
    "test": "vitest run",
    "test:watch": "vitest",
    "dev": "tsc -p tsconfig.json --watch"
  },
  "dependencies": {
    "@car-auctions/shared": "*"
  },
  "devDependencies": {
    "@types/node": "^20.17.57",
    "@vitest/coverage-v8": "^3.2.4",
    "typescript": "^5.9.3",
    "vitest": "^3.2.4"
  }
}
EOF

# --- tsconfig.json ---
cat > "$PKG_DIR/tsconfig.json" <<EOF
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist",
    "composite": true,
    "declaration": true,
    "declarationMap": true
  },
  "include": ["src/**/*.ts"],
  "references": [
    { "path": "../shared" }
  ]
}
EOF

# --- vitest.config.ts ---
cat > "$PKG_DIR/vitest.config.ts" <<'EOF'
import { defineConfig, Plugin } from 'vitest/config';

// Resolve .js ESM imports to .ts source files during test runs (Node16 moduleResolution)
const resolveJsToTs: Plugin = {
  name: 'resolve-js-to-ts',
  resolveId(id, importer) {
    if (importer && id.startsWith('.') && id.endsWith('.js')) {
      return id.replace(/\.js$/, '.ts');
    }
  },
};

export default defineConfig({
  plugins: [resolveJsToTs],
  test: {
    environment: 'node',
    coverage: {
      provider: 'v8',
      thresholds: {
        branches: 80,
        functions: 80,
        lines: 80,
        statements: 80,
      },
      exclude: ['src/index.ts', 'src/types/**'],
    },
  },
});
EOF

# --- config/default.json ---
cat > "$PKG_DIR/config/default.json" <<EOF
{
  "rateLimit": {
    "requestsPerSecond": 0.33,
    "maxDailyRequests": 500,
    "backoffMs": 3000
  },
  "cache": {
    "searchTtlMs": 900000,
    "listingTtlMs": 3600000
  }
}
EOF

# --- src/types/index.ts ---
cat > "$PKG_DIR/src/types/index.ts" <<EOF
// Package-local TypeScript interfaces for $PACKAGE_NAME
export {};
EOF

# --- src/index.ts ---
cat > "$PKG_DIR/src/index.ts" <<EOF
// MCP server entry point for $PACKAGE_NAME
EOF

# --- src/server.ts ---
cat > "$PKG_DIR/src/server.ts" <<EOF
// Tool registration and routing for $PACKAGE_NAME
EOF

# --- Append reference to root tsconfig.json ---
TSCONFIG="$ROOT_DIR/tsconfig.json"
# Use node to safely add the reference
node --input-type=module <<NODEEOF
import { readFileSync, writeFileSync } from 'fs';
const tsconfig = JSON.parse(readFileSync('$TSCONFIG', 'utf8'));
const ref = { path: 'packages/$PACKAGE_NAME' };
const already = tsconfig.references.some(r => r.path === ref.path);
if (!already) {
  tsconfig.references.push(ref);
  writeFileSync('$TSCONFIG', JSON.stringify(tsconfig, null, 2) + '\n');
  console.log('Added reference to root tsconfig.json');
} else {
  console.log('Reference already present in root tsconfig.json');
}
NODEEOF

echo ""
echo "Done! Package scaffolded at packages/$PACKAGE_NAME"
echo "Next steps:"
echo "  1. Run: npm install"
echo "  2. Implement src/index.ts, src/server.ts, and src/tools/"
echo "  3. Run: npm run build -w @car-auctions/$PACKAGE_NAME"
