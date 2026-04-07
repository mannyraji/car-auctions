/**
 * VIN validator
 *
 * Pure function — validates a VIN string without any API calls.
 */

/**
 * Validate a VIN string.
 *
 * Rules: exactly 17 alphanumeric characters; I, O, Q are not allowed.
 *
 * @example
 * validateVin('1HGCM82633A004352'); // { valid: true }
 * validateVin('TOO_SHORT');          // { valid: false, error: '...' }
 */
export function validateVin(vin: string): { valid: boolean; error?: string } {
  if (typeof vin !== 'string' || vin.length === 0) {
    return { valid: false, error: 'VIN must be a non-empty string' };
  }
  if (vin.length !== 17) {
    return { valid: false, error: `VIN must be exactly 17 characters, got ${vin.length}` };
  }
  if (!/^[A-Za-z0-9]+$/.test(vin)) {
    return { valid: false, error: 'VIN must contain only alphanumeric characters' };
  }
  const upper = vin.toUpperCase();
  for (const forbidden of ['I', 'O', 'Q']) {
    if (upper.includes(forbidden)) {
      return { valid: false, error: `VIN must not contain the letter ${forbidden}` };
    }
  }
  return { valid: true };
}
