/**
 * Config loader for IAAI scraper MCP
 *
 * Reads config/default.json and provides typed access to rate-limit,
 * cache TTL, and proxy settings. The file is validated with Zod; any
 * validation errors are logged (field path + message only — no stack
 * traces or file-system paths) and the built-in defaults are used instead.
 */
import path from 'path';
import { fileURLToPath } from 'url';
import { z } from 'zod';
import {
  loadConfigFile,
  validateConfig as genericValidateConfig,
  parseRawConfig as genericParseRawConfig,
} from '@car-auctions/shared';

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

const IaaiConfigSchema = z.object({
  rateLimit: RateLimitSchema,
  cache: CacheSchema,
  proxy: ProxySchema,
});

// ─── TypeScript types (inferred from schemas) ─────────────────────────────────

export type RateLimitConfig = z.infer<typeof RateLimitSchema>;
export type CacheConfig = z.infer<typeof CacheSchema>;
export type ProxyConfig = z.infer<typeof ProxySchema>;
export type IaaiConfig = z.infer<typeof IaaiConfigSchema>;

// ─── Defaults ─────────────────────────────────────────────────────────────────

const DEFAULT_CONFIG: IaaiConfig = {
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

// ─── Bound helpers (exported for testing) ─────────────────────────────────────

export function validateConfig(parsed: unknown): IaaiConfig {
  return genericValidateConfig(parsed, IaaiConfigSchema, DEFAULT_CONFIG);
}

export function parseRawConfig(raw: string): IaaiConfig {
  return genericParseRawConfig(raw, IaaiConfigSchema, DEFAULT_CONFIG);
}

// ─── Loader ───────────────────────────────────────────────────────────────────

const here = fileURLToPath(import.meta.url);
const configPath = path.resolve(path.dirname(here), '..', '..', 'config', 'default.json');

export const config: IaaiConfig = loadConfigFile(configPath, IaaiConfigSchema, DEFAULT_CONFIG);
