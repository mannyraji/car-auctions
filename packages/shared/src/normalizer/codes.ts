/**
 * @file src/normalizer/codes.ts
 * @description IAAI title code and damage code lookup maps.
 * INTERNAL — not re-exported from normalizer/index.ts or src/index.ts.
 */

/**
 * Maps IAAI titleCode strings to human-readable labels.
 * Source: IAAI documentation and observed values in the wild.
 */
export const TITLE_CODE_MAP: Record<string, string> = {
  SV: 'Salvage',
  CL: 'Clean',
  RB: 'Rebuilt',
  FL: 'Flood',
  LM: 'Lemon Law',
  NT: 'Non-Transferable',
  EX: 'Export Only',
  PM: 'Parts Only',
  IN: 'Insurance Retained',
};

/**
 * Converts an IAAI titleCode to a human-readable label.
 * Returns "Unknown" for unrecognised codes and emits a console.warn
 * in non-production environments.
 *
 * @param code - IAAI title code string (e.g. "SV", "CL")
 * @returns Human-readable label or "Unknown"
 */
export function titleCodeToLabel(code: string): string {
  const label = TITLE_CODE_MAP[code];
  if (label !== undefined) {
    return label;
  }
  if (process.env['NODE_ENV'] !== 'production') {
    console.warn(`[car-auctions/shared] Unknown IAAI titleCode: "${code}". Defaulting to "Unknown".`);
  }
  return 'Unknown';
}
