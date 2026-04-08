/**
 * Anti-detection utilities for Copart scraping
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

/** Simulate natural scroll behavior */
export async function simulateScroll(page: Page): Promise<void> {
  const scrolls = Math.floor(Math.random() * 3) + 2;
  for (let i = 0; i < scrolls; i++) {
    const distance = Math.floor(Math.random() * 400) + 100;
    await page.mouse.wheel(0, distance);
    await new Promise<void>((resolve) =>
      setTimeout(resolve, Math.floor(Math.random() * 500) + 200)
    );
  }
}

/** Detect if CAPTCHA is present on the current page */
export function isCaptchaPage(url: string, content?: string): boolean {
  if (url.toLowerCase().includes('captcha')) return true;
  if (url.toLowerCase().includes('challenge')) return true;
  if (content) {
    const lower = content.toLowerCase();
    if (lower.includes('please verify') && lower.includes('human')) return true;
    if (lower.includes('recaptcha')) return true;
    if (lower.includes('hcaptcha')) return true;
    if (lower.includes('cloudflare') && lower.includes('challenge')) return true;
  }
  return false;
}
