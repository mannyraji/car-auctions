/**
 * Anti-detection utilities for IAAI scraping
 */
import type { Page } from 'playwright';

/** Random delay between min and max ms (default 2000-5000) */
export async function randomDelay(minMs = 2000, maxMs = 5000): Promise<void> {
  const ms = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
  await new Promise<void>((resolve) => setTimeout(resolve, ms));
}

/** Simulate mouse movement across the page */
export async function simulateMouseMovement(page: Page): Promise<void> {
  const moves = Math.floor(Math.random() * 5) + 3;
  for (let i = 0; i < moves; i++) {
    const x = Math.floor(Math.random() * 1200) + 100;
    const y = Math.floor(Math.random() * 700) + 100;
    await page.mouse.move(x, y, { steps: Math.floor(Math.random() * 10) + 5 });
    await new Promise<void>((resolve) => setTimeout(resolve, Math.floor(Math.random() * 200) + 50));
  }
}

/**
 * Detect if the current page is a CAPTCHA challenge page.
 *
 * Checks page title and common CAPTCHA-related selectors/content patterns.
 */
export async function isCaptchaPage(page: Page): Promise<boolean> {
  const url = page.url().toLowerCase();
  if (url.includes('captcha') || url.includes('challenge')) return true;

  const title = (await page.title()).toLowerCase();
  if (title.includes('captcha') || title.includes('challenge')) return true;

  // Check for common CAPTCHA selector patterns
  const hasCaptchaSelector = await page
    .locator(
      '[class*="captcha"], [id*="captcha"], iframe[src*="recaptcha"], iframe[src*="hcaptcha"], .cf-challenge-running'
    )
    .count()
    .then((count) => count > 0)
    .catch(() => false);

  if (hasCaptchaSelector) return true;

  // Check page content for CAPTCHA/challenge keywords
  const content = await page.content().catch(() => '');
  const lower = content.toLowerCase();
  if (lower.includes('recaptcha') || lower.includes('hcaptcha')) return true;
  if (lower.includes('please verify') && lower.includes('human')) return true;
  if (lower.includes('cloudflare') && lower.includes('challenge')) return true;

  return false;
}
