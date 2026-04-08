/**
 * Config loader for Copart scraper MCP
 *
 * Reads config/default.json and provides typed access to rate-limit,
 * cache TTL, and proxy settings.
 */
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

export interface RateLimitConfig {
  requestsPerSecond: number;
  maxConcurrent: number;
  backoffMultiplier: number;
  maxBackoffMs: number;
  dailyCap: number;
}

export interface CacheConfig {
  searchTtlMinutes: number;
  listingTtlMinutes: number;
  imageTtlHours: number;
  soldTtlDays: number;
  vinTtlDays: number;
  lruMaxEntries: number;
}

export interface ProxyConfig {
  url: string | null;
  rotateOnFailure: boolean;
}

export interface CopartConfig {
  rateLimit: RateLimitConfig;
  cache: CacheConfig;
  proxy: ProxyConfig;
}

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

function loadConfigFile(): CopartConfig {
  try {
    const here = fileURLToPath(import.meta.url);
    const configPath = path.resolve(path.dirname(here), '..', '..', 'config', 'default.json');
    const raw = readFileSync(configPath, 'utf8');
    return JSON.parse(raw) as CopartConfig;
  } catch {
    return DEFAULT_CONFIG;
  }
}

export const config: CopartConfig = loadConfigFile();
