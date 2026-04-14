import { describe, it, expect, vi } from 'vitest';
import { randomDelay, simulateMouseMovement, isCaptchaPage } from '../src/stealth/index.js';

describe('randomDelay', () => {
  it('resolves after a value within [min, max]', async () => {
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

  it('throws for invalid range', async () => {
    await expect(randomDelay(200, 100, setTimeout)).rejects.toThrow(RangeError);
  });
});

const noopTimer = (fn: () => void, _ms: number) => fn();

describe('simulateMouseMovement', () => {
  it('calls mouse move and wheel', async () => {
    const moveSpy = vi.fn().mockResolvedValue(undefined);
    const wheelSpy = vi.fn().mockResolvedValue(undefined);
    const page = {
      mouse: { move: moveSpy, wheel: wheelSpy },
    } as unknown as import('playwright').Page;

    await simulateMouseMovement(page, noopTimer);

    expect(moveSpy).toHaveBeenCalled();
    expect(wheelSpy).toHaveBeenCalled();
  });
});

function makePage(opts: { title?: string; url?: string; selector?: string | null }) {
  return {
    title: vi.fn().mockResolvedValue(opts.title ?? 'Normal Page'),
    url: vi.fn().mockReturnValue(opts.url ?? 'https://example.com/listings'),
    $: vi.fn().mockImplementation((sel: string) => {
      if (opts.selector && sel === opts.selector) return Promise.resolve({});
      return Promise.resolve(null);
    }),
  } as unknown as import('playwright').Page;
}

describe('isCaptchaPage', () => {
  it('returns false for a normal page', async () => {
    const page = makePage({});
    await expect(isCaptchaPage(page)).resolves.toBe(false);
  });

  it('returns true for captcha titles', async () => {
    const page = makePage({ title: 'CAPTCHA REQUIRED' });
    await expect(isCaptchaPage(page)).resolves.toBe(true);
  });

  it('returns true for captcha URLs', async () => {
    const page = makePage({ url: 'https://example.com/challenge' });
    await expect(isCaptchaPage(page)).resolves.toBe(true);
  });

  it('returns true for recaptcha selectors', async () => {
    const page = makePage({ selector: '.g-recaptcha' });
    await expect(isCaptchaPage(page)).resolves.toBe(true);
  });
});
