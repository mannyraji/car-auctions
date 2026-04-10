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

// ─── Mouse/scroll simulation tuning constants ─────────────────────────────────

/** Minimum number of mouse moves per simulation */
const MOUSE_MOVES_MIN = 3;
/** Maximum number of mouse moves per simulation */
const MOUSE_MOVES_MAX = 8;
/** Minimum X coordinate for mouse moves */
const MOUSE_X_MIN = 100;
/** Maximum X coordinate offset for mouse moves (added to MOUSE_X_MIN) */
const MOUSE_X_RANGE = 1200;
/** Minimum Y coordinate for mouse moves */
const MOUSE_Y_MIN = 100;
/** Maximum Y coordinate offset for mouse moves (added to MOUSE_Y_MIN) */
const MOUSE_Y_RANGE = 700;
/** Minimum steps for a single mouse move (controls smoothness) */
const MOUSE_STEPS_MIN = 5;
/** Maximum steps for a single mouse move */
const MOUSE_STEPS_MAX = 15;
/** Minimum pause between mouse moves in ms */
const MOUSE_PAUSE_MIN_MS = 50;
/** Maximum pause between mouse moves in ms */
const MOUSE_PAUSE_MAX_MS = 250;

/** Minimum number of scroll actions per simulation */
const SCROLL_COUNT_MIN = 2;
/** Maximum number of scroll actions per simulation */
const SCROLL_COUNT_MAX = 5;
/** Minimum scroll distance in pixels */
const SCROLL_DIST_MIN = 100;
/** Maximum scroll distance offset in pixels (added to SCROLL_DIST_MIN) */
const SCROLL_DIST_RANGE = 400;
/** Minimum pause between scroll actions in ms */
const SCROLL_PAUSE_MIN_MS = 200;
/** Maximum pause between scroll actions in ms */
const SCROLL_PAUSE_MAX_MS = 700;

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
  if (!Number.isFinite(minMs) || !Number.isFinite(maxMs)) {
    throw new TypeError('randomDelay requires finite minMs and maxMs values');
  }

  if (minMs > maxMs) {
    throw new RangeError('randomDelay requires minMs to be less than or equal to maxMs');
  }
  const ms = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
  await new Promise<void>((resolve) => timer(resolve, ms));
}

/**
 * Performs random cursor moves and scroll simulation on the given Playwright page.
 * Mimics natural browsing behavior to avoid bot detection.
 */
export async function simulateMouseMovement(page: Page): Promise<void> {
  // Random mouse moves
  const moves =
    Math.floor(Math.random() * (MOUSE_MOVES_MAX - MOUSE_MOVES_MIN + 1)) + MOUSE_MOVES_MIN;
  for (let i = 0; i < moves; i++) {
    const x = Math.floor(Math.random() * MOUSE_X_RANGE) + MOUSE_X_MIN;
    const y = Math.floor(Math.random() * MOUSE_Y_RANGE) + MOUSE_Y_MIN;
    const steps =
      Math.floor(Math.random() * (MOUSE_STEPS_MAX - MOUSE_STEPS_MIN + 1)) + MOUSE_STEPS_MIN;
    await page.mouse.move(x, y, { steps });
    const pause =
      Math.floor(Math.random() * (MOUSE_PAUSE_MAX_MS - MOUSE_PAUSE_MIN_MS + 1)) +
      MOUSE_PAUSE_MIN_MS;
    await new Promise<void>((resolve) => setTimeout(resolve, pause));
  }

  // Random scroll simulation
  const scrolls =
    Math.floor(Math.random() * (SCROLL_COUNT_MAX - SCROLL_COUNT_MIN + 1)) + SCROLL_COUNT_MIN;
  for (let i = 0; i < scrolls; i++) {
    const distance = Math.floor(Math.random() * SCROLL_DIST_RANGE) + SCROLL_DIST_MIN;
    await page.mouse.wheel(0, distance);
    const pause =
      Math.floor(Math.random() * (SCROLL_PAUSE_MAX_MS - SCROLL_PAUSE_MIN_MS + 1)) +
      SCROLL_PAUSE_MIN_MS;
    await new Promise<void>((resolve) => setTimeout(resolve, pause));
  }
}

/**
 * Detects an IAAI CAPTCHA challenge by inspecting the Playwright page's title
 * URL, known CAPTCHA DOM selectors, and fallback content keywords.
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

  // Check known CAPTCHA DOM selectors across differing page mocks/APIs.
  if (typeof page.$ === 'function') {
    for (const selector of CAPTCHA_SELECTORS) {
      const el = await page.$(selector);
      if (el !== null) {
        return true;
      }
    }
  } else if (typeof page.locator === 'function') {
    const hasCaptchaSelector = await page
      .locator(
        '[class*="captcha"], [id*="captcha"], iframe[src*="recaptcha"], iframe[src*="hcaptcha"], .cf-challenge-running'
      )
      .count()
      .then((count) => count > 0)
      .catch(() => false);

    if (hasCaptchaSelector) {
      return true;
    }
  }

  if (typeof page.content === 'function') {
    const content = (await page.content().catch(() => '')).toLowerCase();
    if (content.includes('recaptcha') || content.includes('hcaptcha')) {
      return true;
    }
    if (content.includes('please verify') && content.includes('human')) {
      return true;
    }
    if (content.includes('cloudflare') && content.includes('challenge')) {
      return true;
    }
  }

  return false;
}
