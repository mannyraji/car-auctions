/**
 * @file browser-pool.ts
 * @description Shared Playwright browser pool with stealth plugin and proxy support.
 *
 * Usage:
 *  - Create one `BrowserPool` instance per process
 *  - Call `acquire()` to get a browser context
 *  - Call `release(context)` when done
 *  - Call `shutdown()` to close the browser (idempotent)
 *
 * @since 001-shared-utilities-lib
 */

// ─── Types ───────────────────────────────────────────────────────────────────

import type { Browser, BrowserContext } from 'playwright';

/**
 * Options for constructing a BrowserPool.
 *
 * @example
 * const pool = new BrowserPool({ stealth: true, headless: true, maxContexts: 3 });
 */
export interface BrowserPoolOptions {
  /** Enable stealth fingerprint masking (default: true) */
  stealth?: boolean;
  /** Run browser in headless mode (default: true) */
  headless?: boolean;
  /** Maximum number of concurrent browser contexts (default: 3) */
  maxContexts?: number;
  /** Page navigation timeout in ms (default: 30_000) */
  timeoutMs?: number;
  /** Proxy URL — overrides PROXY_URL environment variable */
  proxyUrl?: string | null;
}

// ─── BrowserPool ─────────────────────────────────────────────────────────────

/**
 * Manages a pool of Playwright browser contexts.
 *
 * Reference-counted: the underlying browser instance is launched on the first
 * `acquire()` call and closed only when `shutdown()` is called. Shutdown is
 * idempotent — calling it multiple times is safe.
 *
 * @example
 * const pool = new BrowserPool();
 * const context = await pool.acquire();
 * const page = await context.newPage();
 * await page.goto('https://example.com');
 * await pool.release(context);
 * await pool.shutdown();
 */
export class BrowserPool {
  private browser: Browser | null = null;
  private readonly activeContexts = new Set<BrowserContext>();
  private shutdownPromise: Promise<void> | null = null;

  private readonly options: Required<Omit<BrowserPoolOptions, 'proxyUrl'>> & {
    proxyUrl: string | null;
  };

  constructor(options?: BrowserPoolOptions) {
    this.options = {
      stealth: options?.stealth ?? true,
      headless: options?.headless ?? true,
      maxContexts: options?.maxContexts ?? 3,
      timeoutMs: options?.timeoutMs ?? 30_000,
      proxyUrl:
        options?.proxyUrl !== undefined
          ? options.proxyUrl
          : (process.env['PROXY_URL'] ?? null),
    };
  }

  /**
   * Acquires a new browser context from the pool.
   * Launches the browser if it hasn't started yet.
   *
   * Throws if the pool has been shut down or if `maxContexts` would be exceeded.
   *
   * @example
   * const ctx = await pool.acquire();
   * const page = await ctx.newPage();
   */
  async acquire(): Promise<BrowserContext> {
    if (this.shutdownPromise !== null) {
      throw new Error('BrowserPool has been shut down');
    }

    if (this.activeContexts.size >= this.options.maxContexts) {
      throw new Error(
        `BrowserPool capacity reached (max ${this.options.maxContexts} contexts)`,
      );
    }

    const browser = await this.ensureBrowser();

    const contextOptions: Parameters<Browser['newContext']>[0] = {
      ...(this.options.proxyUrl
        ? { proxy: { server: this.options.proxyUrl } }
        : {}),
    };

    const context = await browser.newContext(contextOptions);
    context.setDefaultTimeout(this.options.timeoutMs);
    context.setDefaultNavigationTimeout(this.options.timeoutMs);

    this.activeContexts.add(context);
    return context;
  }

  /**
   * Releases a browser context back to the pool and closes it.
   *
   * @example
   * await pool.release(context);
   */
  async release(context: BrowserContext): Promise<void> {
    if (this.activeContexts.has(context)) {
      this.activeContexts.delete(context);
      try {
        await context.close();
      } catch {
        // Ignore close errors — context may already be closed
      }
    }
  }

  /**
   * Shuts down the browser pool and closes the underlying browser process.
   * Idempotent — safe to call multiple times.
   *
   * @example
   * await pool.shutdown();
   */
  async shutdown(): Promise<void> {
    if (this.shutdownPromise) {
      return this.shutdownPromise;
    }

    this.shutdownPromise = this._doShutdown();
    return this.shutdownPromise;
  }

  private async _doShutdown(): Promise<void> {
    // Close all active contexts
    const closePromises = Array.from(this.activeContexts).map((ctx) =>
      ctx.close().catch(() => undefined),
    );
    await Promise.all(closePromises);
    this.activeContexts.clear();

    // Close the browser
    if (this.browser) {
      await this.browser.close().catch(() => undefined);
      this.browser = null;
    }
  }

  /**
   * Number of currently active contexts.
   */
  get activeCount(): number {
    return this.activeContexts.size;
  }

  /**
   * Whether the pool has been shut down.
   */
  get isShutDown(): boolean {
    return this.shutdownPromise !== null;
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  private async ensureBrowser(): Promise<Browser> {
    if (this.browser) return this.browser;

    if (this.options.stealth) {
      this.browser = await this.launchWithStealth();
    } else {
      const { chromium } = await import('playwright');
      this.browser = await chromium.launch({
        headless: this.options.headless,
      });
    }

    return this.browser;
  }

  private async launchWithStealth(): Promise<Browser> {
    const { chromium } = await import('playwright-extra');
    const StealthPlugin = (await import('puppeteer-extra-plugin-stealth')).default;
    chromium.use(StealthPlugin());
    const browser = await chromium.launch({
      headless: this.options.headless,
    });
    return browser as unknown as Browser;
  }
}
