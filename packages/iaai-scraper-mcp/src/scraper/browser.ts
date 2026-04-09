/**
 * IAAI browser lifecycle management
 * Uses Playwright with stealth plugin, IAAI authentication, and session persistence
 */
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import type { Page, BrowserContext } from 'playwright';
import { CaptchaError, ScraperError } from '@car-auctions/shared';
import { isCaptchaPage } from '../utils/stealth.js';
import type { IaaiSession } from '../types/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SESSION_PATH = path.resolve(__dirname, '..', '..', 'data', 'iaai-session.json');
const IAAI_LOGIN_URL = 'https://www.iaai.com/Account/Login';
const IAAI_ORIGIN = 'https://www.iaai.com';

export class IaaiBrowser {
  private browser: import('playwright').Browser | null = null;
  private context: BrowserContext | null = null;
  private launchPromise: Promise<void> | null = null;

  async launch(): Promise<void> {
    if (this.browser) return;
    if (this.launchPromise) {
      await this.launchPromise;
      return;
    }
    this.launchPromise = this._doLaunch();
    await this.launchPromise;
    this.launchPromise = null;
  }

  private async _doLaunch(): Promise<void> {
    // Use dynamic import so Vitest can mock these modules in tests
    const playwrightExtra = (await import('playwright-extra')) as {
      chromium: import('playwright').BrowserType & { use: (plugin: unknown) => void };
    };
    const stealthModule = (await import('puppeteer-extra-plugin-stealth')) as {
      default?: () => unknown;
      [key: string]: unknown;
    };
    const StealthPlugin = stealthModule.default as () => unknown;
    playwrightExtra.chromium.use(StealthPlugin());

    const launchOptions: Parameters<typeof playwrightExtra.chromium.launch>[0] = {
      headless: true,
    };

    const proxyUrl = process.env['PROXY_URL'];
    if (proxyUrl) {
      launchOptions.proxy = { server: proxyUrl };
    }

    this.browser = await playwrightExtra.chromium.launch(launchOptions);
    this.context = await this.browser.newContext({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: { width: 1920, height: 1080 },
    });

    await this.restoreSession();
  }

  /**
   * Authenticate with IAAI using email/password credentials.
   * Fills the login form, submits, checks for CAPTCHA, and persists the session.
   * Throws CaptchaError if a CAPTCHA challenge is detected.
   */
  async authenticate(email: string, password: string): Promise<void> {
    if (!this.context) throw new ScraperError('Browser not launched — call launch() first');

    const page = await this.context.newPage();
    try {
      await page.goto(IAAI_LOGIN_URL, { waitUntil: 'networkidle' });

      if (await isCaptchaPage(page)) {
        throw new CaptchaError('CAPTCHA detected on IAAI login page');
      }

      await page.fill('#Email', email);
      await page.fill('#Password', password);
      await page.click('[type="submit"]');

      await page.waitForLoadState('networkidle');

      if (await isCaptchaPage(page)) {
        throw new CaptchaError('CAPTCHA detected after IAAI login submission');
      }

      await this.saveSession(page);
    } finally {
      await page.close();
    }
  }

  /**
   * Load saved session from disk and hydrate the browser context.
   * Silently succeeds if no session file exists yet.
   */
  async restoreSession(): Promise<void> {
    if (!this.context) return;

    let session: IaaiSession;
    try {
      const raw = await fs.readFile(SESSION_PATH, 'utf-8');
      session = JSON.parse(raw) as IaaiSession;
    } catch {
      // No session yet — that's fine
      return;
    }

    try {
      if (session.cookies?.length) {
        await this.context.addCookies(
          session.cookies as Parameters<typeof this.context.addCookies>[0]
        );
      }

      if (session.localStorage) {
        for (const [origin, store] of Object.entries(session.localStorage)) {
          const page = await this.context.newPage();
          try {
            await page.goto(origin, { waitUntil: 'commit' });
            await page.evaluate((kvMap: Record<string, string>) => {
              for (const [key, value] of Object.entries(kvMap)) {
                localStorage.setItem(key, value);
              }
            }, store);
          } finally {
            await page.close();
          }
        }
      }
    } catch {
      // Best-effort session restoration
    }
  }

  /**
   * Persist current cookies and localStorage to data/iaai-session.json.
   */
  async saveSession(page?: Page): Promise<void> {
    if (!this.context) return;
    try {
      const cookies = await this.context.cookies();

      let localStorageData: Record<string, string> = {};
      if (page && !page.isClosed()) {
        localStorageData = await page
          .evaluate(() => {
            const result: Record<string, string> = {};
            for (let i = 0; i < localStorage.length; i++) {
              const key = localStorage.key(i);
              if (key !== null) {
                const value = localStorage.getItem(key);
                if (value !== null) result[key] = value;
              }
            }
            return result;
          })
          .catch(() => ({}));
      }

      const session: IaaiSession = {
        cookies: cookies as unknown as IaaiSession['cookies'],
        localStorage: { [IAAI_ORIGIN]: localStorageData },
        savedAt: new Date().toISOString(),
      };

      await fs.mkdir(path.dirname(SESSION_PATH), { recursive: true });
      await fs.writeFile(SESSION_PATH, JSON.stringify(session, null, 2));
    } catch {
      // Best-effort session persistence
    }
  }

  /**
   * Get a new page from the browser context.
   * If the page is redirected to the login page, re-authenticates once.
   */
  async getPage(): Promise<Page> {
    await this.launch();
    if (!this.context) throw new ScraperError('Browser context not initialized');

    const page = await this.context.newPage();

    // Detect redirect to login on navigation and re-authenticate once
    page.on('response', (response) => {
      const url = response.url();
      if (url.includes('/Account/Login')) {
        const email = process.env['IAAI_EMAIL'];
        const password = process.env['IAAI_PASSWORD'];
        if (email && password) {
          // Fire and forget — re-auth is best-effort here
          this.authenticate(email, password).catch(() => {});
        }
      }
    });

    return page;
  }

  /**
   * Close the browser, saving the session first.
   */
  async close(): Promise<void> {
    if (this.context) {
      // Save session using a temporary page if needed
      const pages = this.context.pages();
      const activePage = pages.find((p) => !p.isClosed() && p.url().startsWith(IAAI_ORIGIN));
      await this.saveSession(activePage);
    }

    await this.context?.close().catch(() => {});
    await this.browser?.close().catch(() => {});
    this.context = null;
    this.browser = null;
    this.launchPromise = null;
  }
}

// ─── Singleton ────────────────────────────────────────────────────────────────

let _instance: IaaiBrowser | null = null;

/** Returns the shared IaaiBrowser singleton, creating it on first call. */
export function getBrowserInstance(): IaaiBrowser {
  if (!_instance) {
    _instance = new IaaiBrowser();
  }
  return _instance;
}
