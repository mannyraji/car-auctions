/**
 * Bootstrap utilities for the IAAI MCP entry point.
 *
 * Extracted so they can be unit-tested without importing index.ts
 * (which has top-level side effects — initTracing, main()).
 */
import type { McpServerOptions } from '@car-auctions/shared';

// ─── Types ────────────────────────────────────────────────────────────────────

/** Minimal browser interface for cleanup (avoids importing the concrete class in tests). */
export interface Closeable {
  close(): Promise<void>;
}

/** Minimal cache interface for cleanup. */
export interface SyncCloseable {
  close(): void;
}

// ─── Transport resolution ─────────────────────────────────────────────────────

const TRANSPORT_ALIASES: Record<string, McpServerOptions['transport']> = {
  stdio: 'stdio',
  sse: 'sse',
  ws: 'websocket',
  websocket: 'websocket',
};

/**
 * Resolve the MCP transport from the TRANSPORT env var.
 *
 * - Trims and lowercases the raw value before lookup.
 * - `ws` is aliased to `websocket`.
 * - Defaults to `stdio` when the env var is absent or empty.
 * - Throws a descriptive Config error for unrecognised values.
 */
export function resolveTransport(): McpServerOptions['transport'] {
  const raw = (process.env['TRANSPORT'] ?? 'stdio').trim().toLowerCase();
  const resolved = TRANSPORT_ALIASES[raw] ?? (raw === '' ? TRANSPORT_ALIASES['stdio'] : undefined);
  if (!resolved) {
    throw new Error(
      `Config error: invalid TRANSPORT "${raw}". Must be one of: stdio, sse, ws, websocket`
    );
  }
  return resolved;
}

// ─── Credential validation ────────────────────────────────────────────────────

/**
 * Throw if IAAI_EMAIL or IAAI_PASSWORD are absent or empty.
 */
export function assertRequiredCredentials(): void {
  const missing: string[] = [];
  if (!process.env['IAAI_EMAIL']) missing.push('IAAI_EMAIL');
  if (!process.env['IAAI_PASSWORD']) missing.push('IAAI_PASSWORD');
  if (missing.length > 0) {
    throw new Error(
      `Config error: missing required environment variable(s): ${missing.join(', ')}`
    );
  }
}

// ─── Resource cleanup ─────────────────────────────────────────────────────────

/**
 * Close browser and cache, attempting both even if one fails.
 *
 * - If browser.close() throws and cache.close() succeeds, the browser error is rethrown.
 * - If both fail, the browser error is rethrown and the cache error is logged.
 */
export async function closeResources(browser: Closeable, cache: SyncCloseable): Promise<void> {
  let firstError: unknown;

  try {
    await browser.close();
  } catch (err) {
    firstError = err;
  }

  try {
    cache.close();
  } catch (err) {
    if (firstError === undefined) {
      firstError = err;
    } else {
      console.error('Error closing cache during shutdown:', err);
    }
  }

  if (firstError !== undefined) {
    throw firstError;
  }
}

// ─── Startup with cleanup ─────────────────────────────────────────────────────

export interface StartWithCleanupOpts {
  browser: Closeable;
  cache: SyncCloseable;
  /** Async function that starts the server. Resources are cleaned up if it throws. */
  start: () => Promise<void>;
}

/**
 * Run `start()` and close resources if it throws.
 *
 * On success, cleanup is intentionally NOT called — the caller owns the lifecycle
 * (SIGINT/SIGTERM handlers are expected to close resources on graceful shutdown).
 */
export async function startWithCleanup(opts: StartWithCleanupOpts): Promise<void> {
  const { browser, cache, start } = opts;
  try {
    await start();
  } catch (err) {
    try {
      await closeResources(browser, cache);
    } catch (cleanupErr) {
      console.error('Error during startup cleanup:', cleanupErr);
    }
    throw err;
  }
}
