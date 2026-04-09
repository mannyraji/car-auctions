/**
 * Anti-detection utilities for IAAI scraping
 */
import type { Page } from 'playwright';

/** Known IAAI CAPTCHA page title patterns (case-insensitive substring match) */
const CAPTCHA_TITLE_PATTERNS = ['captcha', 'challenge', 'verify', 'robot', 'security check'];

/** Known IAAI CAPTCHA DOM selectors */
const CAPTCHA_SELECTORS = [
  'iframe[src*="recaptcha"]',
  'iframe[src*="hcaptcha"]',
  '.g-recaptcha',
  '#captcha',
  '[data-sitekey]',
  'form[action*="captcha"]',
];

/**
 * Resolves after a random delay within [minMs, maxMs].
 *
 * @param minMs  Lower bound in milliseconds (default 2000)
 * @param maxMs  Upper bound in milliseconds (default 5000)
 * @param timer  Injectable timer function; defaults to real `setTimeout`.
 *               Pass a fake timer in unit tests to avoid real delays.
 */
export async function randomDelay(
  minMs = 2000,
  maxMs = 5000,
  timer: (fn: () => void, ms: number) => void = setTimeout
): Promise<void> {
  const ms = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
  await new Promise<void>((resolve) => timer(resolve, ms));
}

/**
 * Performs random cursor moves and scroll simulation on the given Playwright page.
 * Mimics natural browsing behavior to avoid bot detection.
 */
export async function simulateMouseMovement(page: Page): Promise<void> {
  // Random mouse moves
  const moves = Math.floor(Math.random() * 5) + 3;
  for (let i = 0; i < moves; i++) {
    const x = Math.floor(Math.random() * 1200) + 100;
    const y = Math.floor(Math.random() * 700) + 100;
    await page.mouse.move(x, y, { steps: Math.floor(Math.random() * 10) + 5 });
    await new Promise<void>((resolve) => setTimeout(resolve, Math.floor(Math.random() * 200) + 50));
  }

  // Random scroll simulation
  const scrolls = Math.floor(Math.random() * 3) + 2;
  for (let i = 0; i < scrolls; i++) {
    const distance = Math.floor(Math.random() * 400) + 100;
    await page.mouse.wheel(0, distance);
    await new Promise<void>((resolve) =>
      setTimeout(resolve, Math.floor(Math.random() * 500) + 200)
    );
  }
}

/**
 * Detects an IAAI CAPTCHA challenge by inspecting the Playwright page's title
 * and known CAPTCHA DOM selectors.
 *
 * @returns `true` if a CAPTCHA challenge is detected, `false` otherwise.
 */
export async function isCaptchaPage(page: Page): Promise<boolean> {
  // Check page title
  const title = (await page.title()).toLowerCase();
  if (CAPTCHA_TITLE_PATTERNS.some((pattern) => title.includes(pattern))) {
    return true;
  }

  // Check page URL
  const url = page.url().toLowerCase();
  if (url.includes('captcha') || url.includes('challenge')) {
    return true;
  }

  // Check known CAPTCHA DOM selectors
  for (const selector of CAPTCHA_SELECTORS) {
    const el = await page.$(selector);
    if (el !== null) {
      return true;
    }
  }

  return false;
}
