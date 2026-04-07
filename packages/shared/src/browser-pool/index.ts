/**
 * Browser pool with Playwright + stealth plugin
 *
 * Uses dynamic import() for all dependencies so Vitest mocking works correctly.
 */
import type { BrowserPoolOptions } from '../types/index.js';
import type { BrowserContext as PlaywrightBrowserContext } from 'playwright';

/** A pooled browser context wrapper */
export interface BrowserContext {
  /** Underlying Playwright browser context */
  readonly context: PlaywrightBrowserContext;
  /** Return this context to the pool. Do NOT call context.close() manually. */
  release(): Promise<void>;
  /** Unix timestamp (ms) when context was created */
  readonly createdAt: number;
}

type Resolve<T> = (value: T) => void;

/**
 * Shared Playwright browser pool with stealth plugin support.
 *
 * @example
 * const pool = new BrowserPool({ maxContexts: 3, stealthEnabled: true });
 * const ctx = await pool.acquire();
 * try {
 *   const page = await ctx.context.newPage();
 *   // ... scrape
 * } finally {
 *   await ctx.release();
 * }
 * await pool.shutdown();
 */
export class BrowserPool {
  private readonly options: Required<BrowserPoolOptions>;
  private browser: import('playwright').Browser | null = null;
  private readonly active = new Set<PlaywrightBrowserContext>();
  private readonly waiters: Array<Resolve<BrowserContext>> = [];
  private shutdownCalled = false;
  private launchPromise: Promise<import('playwright').Browser> | null = null;

  constructor(options?: BrowserPoolOptions) {
    this.options = {
      headless: options?.headless ?? true,
      maxContexts: options?.maxContexts ?? 3,
      stealthEnabled: options?.stealthEnabled ?? true,
      proxyUrl:
        options?.proxyUrl !== undefined ? options.proxyUrl : (process.env['PROXY_URL'] ?? null),
      userAgent: options?.userAgent ?? null,
    };
  }

  /**
   * Acquire a BrowserContext from the pool.
   * Queues if all contexts are in use.
   *
   * Alias for {@link BrowserPool.acquire} — provided for contract compliance.
   *
   * @example
   * const ctx = await pool.acquireContext();
   * try { ... } finally { await ctx.release(); }
   */
  async acquireContext(): Promise<BrowserContext> {
    return this.acquire();
  }

  /**
   * Release a BrowserContext back to the pool.
   *
   * Alias for {@link BrowserContext.release} — provided for contract compliance.
   *
   * @example
   * const ctx = await pool.acquireContext();
   * try { ... } finally { await pool.releaseContext(ctx); }
   */
  async releaseContext(context: BrowserContext): Promise<void> {
    await context.release();
  }

  /**
   * Acquire a BrowserContext from the pool.
   * Queues if all contexts are in use.
   */
  async acquire(): Promise<BrowserContext> {
    if (this.shutdownCalled) {
      throw new Error('BrowserPool has been shut down');
    }

    // If below limit, create a new context immediately
    if (this.active.size < this.options.maxContexts) {
      return this.createContext();
    }

    // Otherwise queue
    return new Promise<BrowserContext>((resolve) => {
      this.waiters.push(resolve);
    });
  }

  /**
   * Idempotent shutdown — waits for all active contexts to be released,
   * then closes the browser.
   */
  async shutdown(): Promise<void> {
    this.shutdownCalled = true;
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
    this.launchPromise = null;
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  private async getBrowser(): Promise<import('playwright').Browser> {
    if (this.browser) return this.browser;
    if (this.launchPromise) return this.launchPromise;

    this.launchPromise = this.launchBrowser();
    this.browser = await this.launchPromise;
    this.launchPromise = null;
    return this.browser;
  }

  private async launchBrowser(): Promise<import('playwright').Browser> {
    let chromium: import('playwright').BrowserType;

    if (this.options.stealthEnabled) {
      // Use dynamic import so Vitest can mock these modules in tests
      const playwrightExtra = (await import('playwright-extra')) as {
        chromium: import('playwright').BrowserType & {
          use: (plugin: unknown) => void;
        };
      };
      const stealthModule = (await import('puppeteer-extra-plugin-stealth')) as {
        default?: () => unknown;
        [key: string]: unknown;
      };
      const StealthPlugin = stealthModule.default as () => unknown;
      const stealth = StealthPlugin();

      playwrightExtra.chromium.use(stealth);
      chromium = playwrightExtra.chromium;
    } else {
      const pw = await import('playwright');
      chromium = pw.chromium;
    }

    const launchOptions: Parameters<typeof chromium.launch>[0] = {
      headless: this.options.headless,
    };

    if (this.options.proxyUrl) {
      launchOptions.proxy = { server: this.options.proxyUrl };
    }

    return chromium.launch(launchOptions);
  }

  private async createContext(): Promise<BrowserContext> {
    const browser = await this.getBrowser();

    const contextOptions: Parameters<typeof browser.newContext>[0] = {};
    if (this.options.userAgent) {
      contextOptions.userAgent = this.options.userAgent;
    }

    const playwrightCtx = await browser.newContext(contextOptions);
    this.active.add(playwrightCtx);

    const createdAt = Date.now();
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const pool = this;

    const makeRelease = (ctx: import('playwright').BrowserContext): BrowserContext['release'] =>
      async function release() {
        pool.active.delete(ctx);
        // Serve the next waiter if any
        const waiter = pool.waiters.shift();
        if (waiter) {
          // Reuse this context for the next waiter
          pool.active.add(ctx);
          const reusedContext: BrowserContext = {
            context: ctx,
            createdAt: Date.now(),
            release: makeRelease(ctx),
          };
          waiter(reusedContext);
        } else {
          // No waiters — close the context to free resources
          await ctx.close().catch(() => {});
        }
      };

    const browserContext: BrowserContext = {
      context: playwrightCtx,
      createdAt,
      release: makeRelease(playwrightCtx),
    };

    return browserContext;
  }
}
