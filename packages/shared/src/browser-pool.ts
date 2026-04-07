/**
 * @file src/browser-pool.ts
 * @description Shared Playwright browser pool with stealth plugin and proxy support.
 * Manages a single browser instance across multiple contexts.
 */

import { ScraperError } from './errors.js';
import type { BrowserConfig } from './types/index.js';

// playwright-extra is a CJS module, use createRequire for ESM compatibility
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

/**
 * Options for BrowserPool constructor.
 */
export interface BrowserPoolOptions {
  /**
   * Maximum number of concurrent browser contexts.
   * Default: 3 (NFR-004).
   */
  maxConcurrency?: number;
  /** Whether to use headless mode. Default: true */
  headless?: boolean;
  /** Viewport dimensions. Default: { width: 1280, height: 720 } */
  viewport?: { width: number; height: number };
  /**
   * Proxy URL for all network traffic.
   * Default: process.env.PROXY_URL
   * IMPORTANT: Never hardcode proxy URLs in source code.
   */
  proxyUrl?: string;
  /** Navigation timeout in ms. Default: 30_000 */
  navigationTimeoutMs?: number;
  /** Minimum random delay between user-facing page actions (ms). Default: 2_000 */
  actionDelayMinMs?: number;
  /** Maximum random delay between user-facing page actions (ms). Default: 5_000 */
  actionDelayMaxMs?: number;
}

// Type aliases for Playwright types (dynamic import)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Browser = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type BrowserContext = any;

/**
 * Manages a shared Playwright browser instance with stealth plugin and proxy support.
 *
 * Key behaviors:
 * - Lazily launches a single browser on first getContext() call
 * - Stealth plugin (puppeteer-extra-plugin-stealth) is always active
 * - Maximum concurrent contexts enforced by maxConcurrency (default: 3)
 * - shutdown() is idempotent (dual shutdown calls safe)
 * - Proxy URL sourced from options.proxyUrl ?? process.env.PROXY_URL
 *
 * @example
 * const pool = new BrowserPool({ maxConcurrency: 3 });
 * const ctx = await pool.getContext();
 * const page = await ctx.newPage();
 * await page.goto('https://www.copart.com', { timeout: 30_000 });
 * await pool.releaseContext(ctx);
 * await pool.shutdown(); // idempotent
 */
export class BrowserPool {
  private _browser: Browser | null = null;
  private _contextCount = 0;
  private _shutdownPromise: Promise<void> | null = null;
  private _launchPromise: Promise<Browser> | null = null;
  private _stealthApplied = false;

  private readonly _maxConcurrency: number;
  private readonly _headless: boolean;
  private readonly _viewport: { width: number; height: number };
  private readonly _proxyUrl: string | undefined;
  private readonly _navigationTimeoutMs: number;

  constructor(options: BrowserPoolOptions = {}) {
    this._maxConcurrency = options.maxConcurrency ?? 3;
    this._headless = options.headless ?? true;
    this._viewport = options.viewport ?? { width: 1280, height: 720 };
    this._proxyUrl = options.proxyUrl ?? process.env['PROXY_URL'];
    this._navigationTimeoutMs = options.navigationTimeoutMs ?? 30_000;
    // actionDelayMin/Max stored in options but not used internally by BrowserPool.
    // Consuming packages are responsible for implementing human-like delays.
    void options.actionDelayMinMs;
    void options.actionDelayMaxMs;
  }

  /**
   * Returns a new browser context from the shared browser instance.
   * If the browser is not yet launched, launches it first.
   * Throws ScraperError if maxConcurrency is already reached.
   *
   * @param config - Optional per-context configuration overrides
   * @returns A new Playwright BrowserContext
   * @throws ScraperError when concurrency limit is reached
   */
  async getContext(config?: Partial<BrowserConfig>): Promise<BrowserContext> {
    if (this._shutdownPromise) {
      throw new ScraperError('BrowserPool has been shut down', {
        code: 'SCRAPER_ERROR',
        retryable: false,
      });
    }

    if (this._contextCount >= this._maxConcurrency) {
      throw new ScraperError(
        `BrowserPool concurrency limit reached (${this._maxConcurrency} contexts active)`,
        { code: 'SCRAPER_ERROR', retryable: true }
      );
    }

    const browser = await this._getBrowser();
    const viewport = config?.viewport ?? this._viewport;
    const proxyUrl = config?.proxyUrl ?? this._proxyUrl;

    const contextOptions: Record<string, unknown> = { viewport };
    if (proxyUrl) {
      contextOptions['proxy'] = { server: proxyUrl };
    }

    const ctx = await browser.newContext(contextOptions);
    ctx.setDefaultNavigationTimeout(this._navigationTimeoutMs);
    this._contextCount++;
    return ctx;
  }

  /**
   * Releases a browser context back to the pool (closes it).
   * Decrements the active context counter.
   *
   * @param context - The BrowserContext to release
   */
  async releaseContext(context: BrowserContext): Promise<void> {
    try {
      await context.close();
    } finally {
      this._contextCount = Math.max(0, this._contextCount - 1);
    }
  }

  /**
   * Shuts down the underlying browser process.
   * Idempotent — calling multiple times is safe.
   * Waits for the browser to close before resolving.
   */
  async shutdown(): Promise<void> {
    if (this._shutdownPromise) {
      return this._shutdownPromise;
    }
    this._shutdownPromise = this._doShutdown();
    return this._shutdownPromise;
  }

  private async _doShutdown(): Promise<void> {
    if (this._launchPromise) {
      try {
        const browser = await this._launchPromise;
        await browser.close();
      } catch {
        // Ignore errors during shutdown
      }
    } else if (this._browser) {
      try {
        await this._browser.close();
      } catch {
        // Ignore errors during shutdown
      }
    }
    this._browser = null;
    this._contextCount = 0;
  }

  /**
   * Lazily launches the browser, applying stealth plugin on first call.
   */
  private async _getBrowser(): Promise<Browser> {
    if (this._browser) return this._browser;

    if (this._launchPromise) {
      this._browser = await this._launchPromise;
      return this._browser;
    }

    this._launchPromise = this._launchBrowser();
    this._browser = await this._launchPromise;
    this._launchPromise = null;
    return this._browser;
  }

  private async _launchBrowser(): Promise<Browser> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { chromium } = require('playwright-extra') as { chromium: any };
    const stealth = require('puppeteer-extra-plugin-stealth');

    if (!this._stealthApplied) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      chromium.use(stealth());
      this._stealthApplied = true;
    }

    const launchOptions: Record<string, unknown> = {
      headless: this._headless,
    };

    if (this._proxyUrl) {
      launchOptions['proxy'] = { server: this._proxyUrl };
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    return chromium.launch(launchOptions);
  }
}
