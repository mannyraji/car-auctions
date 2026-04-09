/**
 * IAAI browser lifecycle management
 * Uses Playwright with stealth plugin, IAAI authentication, and session persistence
 */
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import { CaptchaError } from '@car-auctions/shared';
import type { Page, BrowserContext } from 'playwright';
import { isCaptchaPage, randomDelay } from '../utils/stealth.js';
import type { IaaiSession } from '../types/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SESSION_PATH = path.resolve(__dirname, '..', '..', 'data', 'iaai-session.json');
const IAAI_LOGIN_URL = 'https://www.iaai.com/Account/Login';

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

  async authenticate(email: string, password: string): Promise<void> {
    if (!this.context) await this.launch();
    const page = await this.context!.newPage();
    try {
      await page.goto(IAAI_LOGIN_URL, { waitUntil: 'networkidle', timeout: 30000 });

      const pageUrl = page.url();
      const content = await page.content();
      if (isCaptchaPage(pageUrl, content)) {
        throw new CaptchaError('IAAI CAPTCHA detected on login page');
      }

      await page.fill('#Email', email);
      await randomDelay(500, 1000);
      await page.fill('#Password', password);
      await randomDelay(300, 700);
      await Promise.all([page.waitForNavigation({ timeout: 30000 }), page.click('[type="submit"]')]);

      const afterUrl = page.url();
      const afterContent = await page.content();
      if (isCaptchaPage(afterUrl, afterContent)) {
        throw new CaptchaError('IAAI CAPTCHA detected after login attempt');
      }

      await this.saveSession(page);
    } finally {
      await page.close().catch(() => {});
    }
  }

  async restoreSession(): Promise<void> {
    if (!this.context) return;
    try {
      const raw = await fs.readFile(SESSION_PATH, 'utf-8');
      const session = JSON.parse(raw) as IaaiSession;
      await this.context.addCookies(
        session.cookies as Parameters<typeof this.context.addCookies>[0]
      );
    } catch {
      // No saved session — will authenticate on first navigation
    }
  }

  private async saveSession(page: Page): Promise<void> {
    if (!this.context) return;
    try {
      const cookies = await this.context.cookies();
      const localStorage = await page.evaluate<Record<string, Record<string, string>>>(() => {
        const result: Record<string, Record<string, string>> = {};
        const origin = window.location.origin;
        result[origin] = {};
        for (let i = 0; i < window.localStorage.length; i++) {
          const key = window.localStorage.key(i);
          if (key) result[origin][key] = window.localStorage.getItem(key) ?? '';
        }
        return result;
      });
      const session: IaaiSession = {
        cookies: cookies as unknown as IaaiSession['cookies'],
        localStorage,
        savedAt: new Date().toISOString(),
      };
      await fs.mkdir(path.dirname(SESSION_PATH), { recursive: true });
      await fs.writeFile(SESSION_PATH, JSON.stringify(session, null, 2));
    } catch {
      // Best-effort session persistence
    }
  }

  async getPage(): Promise<Page> {
    await this.launch();
    if (!this.context) throw new Error('Browser context not initialized');
    return this.context.newPage();
  }

  async close(): Promise<void> {
    await this.context?.close().catch(() => {});
    await this.browser?.close().catch(() => {});
    this.context = null;
    this.browser = null;
  }
}

let _instance: IaaiBrowser | null = null;

/** Singleton accessor for the shared IaaiBrowser instance. */
export function getBrowserInstance(): IaaiBrowser {
  if (!_instance) _instance = new IaaiBrowser();
  return _instance;
}
