/**
 * VIN validator edge-case tests
 *
 * Covers "Things to watch" from PR #27:
 * - Pre-1981 VINs (shorter than 17 chars) are intentionally rejected
 * - Check digit (position 9) is NOT validated — only format rules
 * - Case-insensitive: lowercase VINs pass validation
 * - Boundary inputs: whitespace, unicode, numeric-only, exactly 17 I/O/Q chars
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { validateVin } from '../src/vin-decoder/validator.js';
import { decodeVin } from '../src/vin-decoder/decoder.js';
import { InMemoryVinCache } from '../src/vin-decoder/memory-cache.js';
import nhtsaFixture from './fixtures/nhtsa-decode-response.json';

// ─── Pre-1981 VINs ──────────────────────────────────────────────────────────

describe('validateVin — pre-1981 VINs', () => {
  it('rejects a 13-character pre-1981 VIN', () => {
    // Many pre-1981 VINs are 11–13 characters
    const result = validateVin('AB12345CD678E');
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/17/);
  });

  it('rejects an 11-character pre-1981 VIN', () => {
    const result = validateVin('12345678901');
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/17/);
  });

  it('rejects a 5-character VIN (early format)', () => {
    const result = validateVin('AB123');
    expect(result.valid).toBe(false);
  });
});

// ─── Check digit position 9 ─────────────────────────────────────────────────

describe('validateVin — check digit behavior', () => {
  // The validator does NOT perform check digit validation.
  // This is by design — spec only requires format checks.
  // These tests document that behavior so any future change is intentional.

  it('accepts a VIN with correct check digit', () => {
    // 1HGCM82633A004352 has valid check digit '3' at position 9
    const result = validateVin('1HGCM82633A004352');
    expect(result.valid).toBe(true);
  });

  it('accepts a VIN with INCORRECT check digit (no check digit validation)', () => {
    // Swap position 9 from '3' to '0' — invalid check digit
    const bad = '1HGCM82603A004352';
    const result = validateVin(bad);
    // Validator only checks format, not check digit — so this passes
    expect(result.valid).toBe(true);
  });

  it('accepts a VIN with check digit position set to X (valid per standard)', () => {
    // 'X' is a valid check digit value (represents 10)
    const vin = '1HGCM826X3A004352';
    const result = validateVin(vin);
    expect(result.valid).toBe(true);
  });
});

// ─── Case sensitivity ────────────────────────────────────────────────────────

describe('validateVin — case sensitivity', () => {
  it('accepts all-lowercase VIN', () => {
    const result = validateVin('1hgcm82633a004352');
    expect(result.valid).toBe(true);
  });

  it('accepts mixed-case VIN', () => {
    const result = validateVin('1HgCm82633a004352');
    expect(result.valid).toBe(true);
  });

  it('rejects lowercase i (forbidden character)', () => {
    const result = validateVin('1hgcm82633i004352');
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/I/);
  });

  it('rejects lowercase o (forbidden character)', () => {
    const result = validateVin('1hgcm82633o004352');
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/O/);
  });

  it('rejects lowercase q (forbidden character)', () => {
    const result = validateVin('1hgcm82633q004352');
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/Q/);
  });
});

// ─── Boundary / adversarial inputs ───────────────────────────────────────────

describe('validateVin — boundary inputs', () => {
  it('rejects whitespace-only string', () => {
    const result = validateVin('                 ');
    expect(result.valid).toBe(false);
  });

  it('rejects VIN with leading/trailing spaces', () => {
    const result = validateVin(' 1HGCM82633A00435');
    expect(result.valid).toBe(false);
  });

  it('rejects VIN with embedded spaces', () => {
    const result = validateVin('1HGCM826 3A004352');
    expect(result.valid).toBe(false);
  });

  it('rejects VIN with unicode characters', () => {
    const result = validateVin('1HGCM82633A0043é2');
    expect(result.valid).toBe(false);
  });

  it('accepts 17-digit all-numeric VIN', () => {
    // All-numeric is valid per format rules (no I/O/Q to reject)
    const result = validateVin('12345678901234567');
    expect(result.valid).toBe(true);
  });

  it('rejects VIN that is exactly 16 characters', () => {
    const result = validateVin('1HGCM82633A00435');
    expect(result.valid).toBe(false);
  });

  it('rejects VIN that is exactly 18 characters', () => {
    const result = validateVin('1HGCM82633A0043521');
    expect(result.valid).toBe(false);
  });
});

// ─── decodeVin with invalid check digit ──────────────────────────────────────

describe('decodeVin — VINs with invalid check digits still decode', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sends VIN with invalid check digit to NHTSA (no local rejection)', async () => {
    // Position 9 changed from '3' to '0' — invalid check digit
    const badCheckDigitVin = '1HGCM82603A004352';

    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: () => Promise.resolve(nhtsaFixture),
    } as Response);

    const result = await decodeVin(badCheckDigitVin);
    // The decoder doesn't validate check digit — it delegates to NHTSA
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(result.vin).toBe(badCheckDigitVin);
  });

  it('NHTSA may return error code for bad VIN', async () => {
    const badVin = '1HGCM82603A004352';

    // NHTSA sometimes returns errorCode != "0" for invalid VINs
    const nhtsaErrorResponse = {
      Count: 1,
      Message: 'Results returned successfully',
      Results: [
        {
          VIN: badVin,
          ErrorCode: '5',
          ErrorText: '5 - VIN has errors in one or more positions',
          Make: '',
          Model: '',
          ModelYear: '',
        },
      ],
    };

    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: () => Promise.resolve(nhtsaErrorResponse),
    } as Response);

    const result = await decodeVin(badVin);
    // The decoder returns the result even with a non-zero errorCode —
    // callers inspect errorCode to decide how to handle partial data
    expect(result.errorCode).toBe('5');
    expect(result.year).toBe(0); // empty ModelYear → 0
  });
});

// ─── Negative cache isolation ────────────────────────────────────────────────

describe('decodeVin — negative cache does not interfere with valid VINs', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('failing VIN A does not block decoding VIN B', async () => {
    const cache = new InMemoryVinCache();
    const VIN_A = '1HGCM82633A004352';
    const VIN_B = '2T1BU4EE0DC123456';

    // VIN A fails
    vi.mocked(fetch).mockRejectedValueOnce(new Error('timeout'));
    await expect(decodeVin(VIN_A, { cache })).rejects.toThrow();

    // VIN B succeeds
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: () =>
        Promise.resolve({
          ...nhtsaFixture,
          Results: [{ ...(nhtsaFixture.Results[0] as Record<string, string>), VIN: VIN_B }],
        }),
    } as Response);

    const result = await decodeVin(VIN_B, { cache });
    expect(result.vin).toBe(VIN_B);
  });
});
