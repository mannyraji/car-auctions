/**
 * Config loader for Copart scraper MCP
 *
 * Reads config/default.json and provides typed access to rate-limit,
 * cache TTL, and proxy settings.  The file is validated with Zod; any
 * validation errors are logged (field path + message only — no stack
 * traces or file-system paths) and the built-in defaults are used instead.
 */
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { z } from 'zod';

// ─── Zod schemas ──────────────────────────────────────────────────────────────

const RateLimitSchema = z.object({
  requestsPerSecond: z.number().positive(),
  maxConcurrent: z.number().int().positive(),
  backoffMultiplier: z.number().positive(),
  maxBackoffMs: z.number().int().positive(),
  dailyCap: z.number().int().positive(),
});

const CacheSchema = z.object({
  searchTtlMinutes: z.number().int().positive(),
  listingTtlMinutes: z.number().int().positive(),
  imageTtlHours: z.number().int().positive(),
  soldTtlDays: z.number().int().positive(),
  vinTtlDays: z.number().int().positive(),
  lruMaxEntries: z.number().int().positive(),
});

const ProxySchema = z.object({
  url: z.string().nullable(),
  rotateOnFailure: z.boolean(),
});

const CopartConfigSchema = z.object({
  rateLimit: RateLimitSchema,
  cache: CacheSchema,
  proxy: ProxySchema,
});

// ─── TypeScript types (inferred from schemas) ─────────────────────────────────

export type RateLimitConfig = z.infer<typeof RateLimitSchema>;
export type CacheConfig = z.infer<typeof CacheSchema>;
export type ProxyConfig = z.infer<typeof ProxySchema>;
export type CopartConfig = z.infer<typeof CopartConfigSchema>;

// ─── Defaults ─────────────────────────────────────────────────────────────────

const DEFAULT_CONFIG: CopartConfig = {
  rateLimit: {
    requestsPerSecond: 0.33,
    maxConcurrent: 1,
    backoffMultiplier: 2,
    maxBackoffMs: 60000,
    dailyCap: 500,
  },
  cache: {
    searchTtlMinutes: 15,
    listingTtlMinutes: 60,
    imageTtlHours: 24,
    soldTtlDays: 7,
    vinTtlDays: 90,
    lruMaxEntries: 200,
  },
  proxy: {
    url: null,
    rotateOnFailure: true,
  },
};

// ─── Loader ───────────────────────────────────────────────────────────────────

/**
 * Validate a parsed (unknown) value against the CopartConfig schema.
 *
 * Returns `DEFAULT_CONFIG` (with a warning) when validation fails.
 * Exported for testing.
 */
export function validateConfig(parsed: unknown): CopartConfig {
  // Empty object means "no overrides" — use defaults without a warning
  if (
    parsed !== null &&
    typeof parsed === 'object' &&
    !Array.isArray(parsed) &&
    Object.keys(parsed).length === 0
  ) {
    return DEFAULT_CONFIG;
  }

  const result = CopartConfigSchema.safeParse(parsed);
  if (!result.success) {
    // Option B: surface field path + message; omit stack traces and file-system paths
    const issues = result.error.issues
      .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('; ');
    console.warn(`[config] default.json validation failed (using defaults) — ${issues}`);
    return DEFAULT_CONFIG;
  }

  return result.data;
}

/**
 * Parse a raw JSON string and validate it as CopartConfig.
 *
 * Returns `DEFAULT_CONFIG` (with a warning) when the string is not valid JSON.
 * Exported for testing.
 */
export function parseRawConfig(raw: string): CopartConfig {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    console.warn('[config] default.json is not valid JSON — using defaults');
    return DEFAULT_CONFIG;
  }
  return validateConfig(parsed);
}

export function loadConfigFile(): CopartConfig {
  let raw: string;
  try {
    const here = fileURLToPath(import.meta.url);
    const configPath = path.resolve(path.dirname(here), '..', '..', 'config', 'default.json');
    raw = readFileSync(configPath, 'utf8');
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'unknown error';
    console.warn(`[config] Could not read default.json (${reason}) — using defaults`);
    return DEFAULT_CONFIG;
  }

  return parseRawConfig(raw);
}

export const config: CopartConfig = loadConfigFile();
