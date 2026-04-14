/**
 * Generic config loader for scraper MCP packages.
 *
 * Reads a JSON file, validates it with a caller-supplied Zod schema, and
 * falls back to caller-supplied defaults when the file is missing, empty,
 * or invalid.  Validation issues are logged as warnings (field path + message
 * only — no stack traces or file-system paths).
 */
import { readFileSync } from 'fs';

/** Structural type compatible with any Zod schema — avoids cross-package version mismatches. */
interface Schema<T> {
  safeParse(
    data: unknown
  ):
    | { success: true; data: T }
    | { success: false; error: { issues: Array<{ path: (string | number)[]; message: string }> } };
}

/**
 * Validate a parsed value against a Zod schema.
 * Returns `defaults` (with a warning) when validation fails.
 * An empty object `{}` is treated as "no overrides" and returns defaults silently.
 */
export function validateConfig<T>(parsed: unknown, schema: Schema<T>, defaults: T): T {
  if (
    parsed !== null &&
    typeof parsed === 'object' &&
    !Array.isArray(parsed) &&
    Object.keys(parsed).length === 0
  ) {
    return defaults;
  }

  const result = schema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('; ');
    console.warn(`[config] default.json validation failed (using defaults) — ${issues}`);
    return defaults;
  }

  return result.data;
}

/**
 * Parse a raw JSON string and validate it against a Zod schema.
 * Returns `defaults` (with a warning) when the string is not valid JSON.
 */
export function parseRawConfig<T>(raw: string, schema: Schema<T>, defaults: T): T {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    console.warn('[config] default.json is not valid JSON — using defaults');
    return defaults;
  }
  return validateConfig(parsed, schema, defaults);
}

/**
 * Load and validate a config file.
 * Returns `defaults` silently when the file is missing or unreadable.
 */
export function loadConfigFile<T>(configPath: string, schema: Schema<T>, defaults: T): T {
  let raw: string;
  try {
    raw = readFileSync(configPath, 'utf8');
  } catch {
    return defaults;
  }

  return parseRawConfig(raw, schema, defaults);
}
