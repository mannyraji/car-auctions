/**
 * Public API contract test
 *
 * Parses the runtime (non-type) exports declared in
 * specs/001-shared-utilities-lib/contracts/public-api.md and verifies that
 * every one of them is actually re-exported from the barrel (src/index.ts).
 * Catches regressions where downstream MCP server packages would break due
 * to missing exports.
 *
 * Type exports are verified at compile time only (they are erased at runtime
 * and cannot be checked dynamically); see the "type exports compile" suite.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as shared from '../src/index.js';

/**
 * Parse the runtime (non-type) export names from the barrel export code block
 * in the contract markdown file.
 *
 * Strategy:
 *   1. Extract the first ```typescript … ``` code block.
 *   2. Strip `export type { … }` blocks (all type-only exports).
 *   3. From remaining `export { … }` blocks, skip items prefixed `type `.
 */
function parseContractRuntimeExports(): string[] {
  const contractPath = fileURLToPath(
    new URL(
      '../../../specs/001-shared-utilities-lib/contracts/public-api.md',
      import.meta.url,
    ),
  );
  const content = readFileSync(contractPath, 'utf-8');

  // Extract the typescript code block
  const codeBlockMatch = content.match(/```typescript\n([\s\S]*?)```/);
  if (!codeBlockMatch) {
    throw new Error('No typescript code block found in public-api.md');
  }
  const code = codeBlockMatch[1];

  // Remove `export type { ... }` blocks entirely — use `s` flag so `.` / [^}] matches newlines
  const withoutTypeBlocks = code.replace(/export type \{[^}]*\}/gs, '');

  const runtimeExports: string[] = [];

  // Collect names from every remaining `export { ... }` block (s flag for multiline)
  const exportBlockRegex = /export \{([^}]+)\}/gs;
  let blockMatch: RegExpExecArray | null;
  while ((blockMatch = exportBlockRegex.exec(withoutTypeBlocks)) !== null) {
    const blockContent = blockMatch[1];
    blockContent
      .split(/[\n,]/)
      .map((s) => s.replace(/\/\/.*$/, '').trim()) // strip inline comments
      .filter((s) => s && !s.startsWith('type ')) // skip `type Foo` re-exports
      .forEach((name) => runtimeExports.push(name));
  }

  return runtimeExports;
}

// ─── Type exports (verified structurally via runtime artefacts) ──────────────

describe('Public API — type exports compile', () => {
  // Types are erased at runtime so we verify them by constructing values
  // that satisfy the interfaces. If any type export is missing, TS will
  // fail to compile this test file.

  it('AuctionListing interface is usable', () => {
    const listing: import('../src/index.js').AuctionListing = {
      source: 'copart',
      lot_number: '1',
      vin: '1HGCM82633A004352',
      year: 2003,
      make: 'Honda',
      model: 'Accord',
      trim: null,
      title_type: 'SV',
      title_code: 'SV',
      damage_primary: 'FRONT END',
      damage_secondary: null,
      has_keys: true,
      odometer: 100000,
      odometer_status: null,
      color: null,
      engine: null,
      transmission: null,
      drive_type: null,
      fuel_type: null,
      cylinders: null,
      current_bid: null,
      buy_now_price: null,
      sale_date: null,
      sale_status: 'UPCOMING',
      final_bid: null,
      location: 'Houston, TX',
      latitude: null,
      longitude: null,
      image_url: null,
      image_urls: [],
      detail_url: '',
      seller: null,
      grid_row: null,
      fetched_at: new Date().toISOString(),
    };
    expect(listing.source).toBe('copart');
  });

  it('ToolResponse envelope is usable', () => {
    const resp: import('../src/index.js').ToolResponse<string> = {
      success: true,
      data: 'ok',
      error: null,
      cached: false,
      stale: false,
      cachedAt: null,
      timestamp: new Date().toISOString(),
    };
    expect(resp.success).toBe(true);
  });

  it('RiskFlag interface is usable', () => {
    const flag: import('../src/index.js').RiskFlag = {
      type: 'title_wash',
      severity: 'critical',
      detail: 'Title history mismatch',
      source: null,
    };
    expect(flag.severity).toBe('critical');
  });

  it('VINDecodeResult interface is usable', () => {
    const result: import('../src/index.js').VINDecodeResult = {
      vin: '1HGCM82633A004352',
      year: 2003,
      make: 'HONDA',
      model: 'Accord',
      trim: null,
      engineType: null,
      bodyClass: null,
      driveType: null,
      fuelType: null,
      transmission: null,
      cylinders: null,
      displacementL: null,
      manufacturer: null,
      plantCountry: null,
      vehicleType: null,
      errorCode: '0',
    };
    expect(result.vin).toBeTruthy();
  });
});

// ─── Contract-driven runtime export checks ───────────────────────────────────

describe('Public API — every runtime export in public-api.md is present in the barrel', () => {
  const contractExports = parseContractRuntimeExports();

  it('contract file lists at least one runtime export', () => {
    expect(contractExports.length).toBeGreaterThan(0);
  });

  it.each(contractExports)('"%s" is exported from src/index.ts', (name) => {
    expect(shared).toHaveProperty(name);
  });
});

// ─── No unexpected default export ────────────────────────────────────────────

describe('Public API — tree-shakeable (no default export)', () => {
  it('has no default export', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((shared as any).default).toBeUndefined();
  });
});
