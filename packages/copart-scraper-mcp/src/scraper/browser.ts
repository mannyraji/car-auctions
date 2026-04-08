/**
 * Copart browser lifecycle management
 * Uses Playwright with stealth plugin and cookie persistence
 */
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import type { Page, BrowserContext } from 'playwright';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const COOKIES_PATH = path.resolve(__dirname, '..', '..', 'data', 'cookies.json');

export class CopartBrowser {
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

    try {
      const cookieData = await fs.readFile(COOKIES_PATH, 'utf-8');
      const cookies = JSON.parse(cookieData) as Parameters<typeof this.context.addCookies>[0];
      await this.context.addCookies(cookies);
    } catch {
      // No cookies yet — that's fine
    }
  }

  async getPage(): Promise<Page> {
    await this.launch();
    if (!this.context) throw new Error('Browser context not initialized');
    return this.context.newPage();
  }

  async saveCookies(): Promise<void> {
    if (!this.context) return;
    try {
      const cookies = await this.context.cookies();
      await fs.mkdir(path.dirname(COOKIES_PATH), { recursive: true });
      await fs.writeFile(COOKIES_PATH, JSON.stringify(cookies, null, 2));
    } catch {
      // Best-effort cookie persistence
    }
  }

  async close(): Promise<void> {
    await this.saveCookies();
    await this.context?.close().catch(() => {});
    await this.browser?.close().catch(() => {});
    this.context = null;
    this.browser = null;
  }
}
