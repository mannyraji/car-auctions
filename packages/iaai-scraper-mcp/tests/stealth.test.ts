import { describe, it, expect, vi } from 'vitest';
import { randomDelay, simulateMouseMovement, isCaptchaPage } from '../src/utils/stealth.js';

// ─── randomDelay ──────────────────────────────────────────────────────────────

describe('randomDelay', () => {
  it('resolves after a delay within [min, max]', async () => {
    const delays: number[] = [];
    const fakeTimer = (fn: () => void, ms: number) => {
      delays.push(ms);
      fn();
    };

    await randomDelay(100, 200, fakeTimer);
    expect(delays).toHaveLength(1);
    expect(delays[0]).toBeGreaterThanOrEqual(100);
    expect(delays[0]).toBeLessThanOrEqual(200);
  });

  it('uses default range [2000, 5000] when no args given', async () => {
    const delays: number[] = [];
    const fakeTimer = (fn: () => void, ms: number) => {
      delays.push(ms);
      fn();
    };

    await randomDelay(undefined, undefined, fakeTimer);
    expect(delays[0]).toBeGreaterThanOrEqual(2000);
    expect(delays[0]).toBeLessThanOrEqual(5000);
  });

  it('resolves when min === max', async () => {
    const fakeTimer = (fn: () => void, _ms: number) => fn();
    await expect(randomDelay(500, 500, fakeTimer)).resolves.toBeUndefined();
  });
});

// ─── simulateMouseMovement ────────────────────────────────────────────────────

describe('simulateMouseMovement', () => {
  it('calls page.mouse.move and page.mouse.wheel at least once', async () => {
    const moveSpy = vi.fn().mockResolvedValue(undefined);
    const wheelSpy = vi.fn().mockResolvedValue(undefined);
    const mockPage = {
      mouse: { move: moveSpy, wheel: wheelSpy },
    } as unknown as import('playwright').Page;

    await simulateMouseMovement(mockPage);

    expect(moveSpy).toHaveBeenCalled();
    expect(wheelSpy).toHaveBeenCalled();
  });

  it('moves the cursor to coordinates within expected viewport range', async () => {
    const moveSpy = vi.fn().mockResolvedValue(undefined);
    const wheelSpy = vi.fn().mockResolvedValue(undefined);
    const mockPage = {
      mouse: { move: moveSpy, wheel: wheelSpy },
    } as unknown as import('playwright').Page;

    await simulateMouseMovement(mockPage);

    for (const [x, y] of moveSpy.mock.calls) {
      expect(x).toBeGreaterThanOrEqual(100);
      expect(x).toBeLessThanOrEqual(1300);
      expect(y).toBeGreaterThanOrEqual(100);
      expect(y).toBeLessThanOrEqual(800);
    }
  });
});

// ─── isCaptchaPage ────────────────────────────────────────────────────────────

function makePage(opts: { title?: string; url?: string; selector?: string | null }) {
  return {
    title: vi.fn().mockResolvedValue(opts.title ?? 'Normal Page'),
    url: vi.fn().mockReturnValue(opts.url ?? 'https://www.iaai.com/vehiclesearch'),
    $: vi.fn().mockImplementation((sel: string) => {
      if (opts.selector && sel === opts.selector) return Promise.resolve({});
      return Promise.resolve(null);
    }),
  } as unknown as import('playwright').Page;
}

describe('isCaptchaPage', () => {
  it('returns false for a normal IAAI page', async () => {
    const page = makePage({});
    expect(await isCaptchaPage(page)).toBe(false);
  });

  it('returns true when page title contains "captcha"', async () => {
    const page = makePage({ title: 'Captcha Challenge' });
    expect(await isCaptchaPage(page)).toBe(true);
  });

  it('returns true when page title contains "challenge"', async () => {
    const page = makePage({ title: 'Security Challenge' });
    expect(await isCaptchaPage(page)).toBe(true);
  });

  it('returns true when page title contains "verify"', async () => {
    const page = makePage({ title: 'Please Verify' });
    expect(await isCaptchaPage(page)).toBe(true);
  });

  it('returns true when page title contains "robot"', async () => {
    const page = makePage({ title: 'Are you a robot?' });
    expect(await isCaptchaPage(page)).toBe(true);
  });

  it('returns true when page title contains "security check"', async () => {
    const page = makePage({ title: 'Security Check Required' });
    expect(await isCaptchaPage(page)).toBe(true);
  });

  it('returns true when URL contains "captcha"', async () => {
    const page = makePage({ url: 'https://www.iaai.com/captcha' });
    expect(await isCaptchaPage(page)).toBe(true);
  });

  it('returns true when URL contains "challenge"', async () => {
    const page = makePage({ url: 'https://www.iaai.com/challenge' });
    expect(await isCaptchaPage(page)).toBe(true);
  });

  it('returns true when .g-recaptcha element is present', async () => {
    const page = makePage({ selector: '.g-recaptcha' });
    expect(await isCaptchaPage(page)).toBe(true);
  });

  it('returns true when #captcha element is present', async () => {
    const page = makePage({ selector: '#captcha' });
    expect(await isCaptchaPage(page)).toBe(true);
  });

  it('returns true when [data-sitekey] element is present', async () => {
    const page = makePage({ selector: '[data-sitekey]' });
    expect(await isCaptchaPage(page)).toBe(true);
  });

  it('is case-insensitive for title matching', async () => {
    const page = makePage({ title: 'CAPTCHA REQUIRED' });
    expect(await isCaptchaPage(page)).toBe(true);
  });
});
