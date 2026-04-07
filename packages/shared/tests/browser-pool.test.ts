import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Use vi.hoisted so mock variables are available when vi.mock factories are hoisted
const { mockContext, mockBrowser, mockChromiumExtra, mockStealthPlugin } = vi.hoisted(() => {
  const ctx = {
    newPage: vi.fn().mockResolvedValue({}),
    close: vi.fn().mockResolvedValue(undefined),
  };
  const browser = {
    newContext: vi.fn().mockResolvedValue(ctx),
    close: vi.fn().mockResolvedValue(undefined),
  };
  const stealthPlugin = vi.fn().mockReturnValue({ name: 'stealth' });
  const chromiumExtra = {
    use: vi.fn(),
    launch: vi.fn().mockResolvedValue(browser),
  };
  return {
    mockContext: ctx,
    mockBrowser: browser,
    mockChromiumExtra: chromiumExtra,
    mockStealthPlugin: stealthPlugin,
  };
});

vi.mock('playwright', () => ({
  chromium: {
    launch: vi.fn().mockResolvedValue(mockBrowser),
  },
}));

vi.mock('puppeteer-extra-plugin-stealth', () => ({
  default: mockStealthPlugin,
}));

vi.mock('playwright-extra', () => ({
  chromium: mockChromiumExtra,
}));

import { BrowserPool } from '../src/browser-pool/index.js';
import { chromium as playwrightChromium } from 'playwright';

describe('BrowserPool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Re-setup mocks after clearAllMocks
    mockBrowser.newContext.mockResolvedValue(mockContext);
    mockBrowser.close.mockResolvedValue(undefined);
    mockContext.close.mockResolvedValue(undefined);
    mockChromiumExtra.launch.mockResolvedValue(mockBrowser);
    vi.mocked(playwrightChromium.launch).mockResolvedValue(
      mockBrowser as unknown as import('playwright').Browser
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('acquire() returns a BrowserContext with required shape', async () => {
    const pool = new BrowserPool({ stealthEnabled: false });
    const ctx = await pool.acquire();

    expect(ctx).toHaveProperty('context');
    expect(ctx).toHaveProperty('release');
    expect(ctx).toHaveProperty('createdAt');
    expect(typeof ctx.release).toBe('function');
    expect(typeof ctx.createdAt).toBe('number');

    await ctx.release();
    await pool.shutdown();
  });

  it('multiple acquire() calls share a single browser instance', async () => {
    const pool = new BrowserPool({ maxContexts: 2, stealthEnabled: false });

    const ctx1 = await pool.acquire();
    const ctx2 = await pool.acquire();

    // Both contexts should come from the same browser (launch called once)
    expect(vi.mocked(playwrightChromium.launch)).toHaveBeenCalledTimes(1);
    expect(mockBrowser.newContext).toHaveBeenCalledTimes(2);

    await ctx1.release();
    await ctx2.release();
    await pool.shutdown();
  });

  it('queues requests when maxContexts is exceeded', async () => {
    const pool = new BrowserPool({ maxContexts: 1, stealthEnabled: false });

    const ctx1 = await pool.acquire();
    let ctx2Resolved = false;

    const ctx2Promise = pool.acquire().then((ctx) => {
      ctx2Resolved = true;
      return ctx;
    });

    // ctx2 should not be resolved yet
    await new Promise((r) => setTimeout(r, 10));
    expect(ctx2Resolved).toBe(false);

    // Release ctx1 — should unblock ctx2
    await ctx1.release();
    const ctx2 = await ctx2Promise;
    expect(ctx2Resolved).toBe(true);

    await ctx2.release();
    await pool.shutdown();
  });

  it('release() makes context available to queued waiters', async () => {
    const pool = new BrowserPool({ maxContexts: 1, stealthEnabled: false });

    const ctx1 = await pool.acquire();
    const ctx2Promise = pool.acquire();

    await ctx1.release();
    const ctx2 = await ctx2Promise;
    expect(ctx2).toBeDefined();

    await ctx2.release();
    await pool.shutdown();
  });

  it('shutdown() is idempotent — calling twice does not throw', async () => {
    const pool = new BrowserPool({ stealthEnabled: false });
    const ctx = await pool.acquire();
    await ctx.release();

    await expect(pool.shutdown()).resolves.toBeUndefined();
    await expect(pool.shutdown()).resolves.toBeUndefined();
  });

  it('applies stealth plugin when stealthEnabled: true (default)', async () => {
    const pool = new BrowserPool({ stealthEnabled: true });
    const ctx = await pool.acquire();
    await ctx.release();
    await pool.shutdown();

    expect(mockChromiumExtra.use).toHaveBeenCalled();
  });

  it('forwards proxyUrl to browser launch options', async () => {
    const pool = new BrowserPool({
      proxyUrl: 'http://proxy.example.com:8080',
      stealthEnabled: false,
    });
    const ctx = await pool.acquire();
    await ctx.release();
    await pool.shutdown();

    expect(vi.mocked(playwrightChromium.launch)).toHaveBeenCalledWith(
      expect.objectContaining({
        proxy: { server: 'http://proxy.example.com:8080' },
      })
    );
  });

  it('pool shuts down cleanly with no orphaned processes', async () => {
    const pool = new BrowserPool({ stealthEnabled: false });
    const ctx = await pool.acquire();
    await ctx.release();
    await pool.shutdown();

    expect(mockBrowser.close).toHaveBeenCalled();
  });

  it('acquireContext() resolves to a BrowserContext with the same shape as acquire()', async () => {
    const pool = new BrowserPool({ stealthEnabled: false });
    const ctx = await pool.acquireContext();

    expect(ctx).toHaveProperty('context');
    expect(ctx).toHaveProperty('release');
    expect(ctx).toHaveProperty('createdAt');
    expect(typeof ctx.release).toBe('function');
    expect(typeof ctx.createdAt).toBe('number');

    await ctx.release();
    await pool.shutdown();
  });

  it('acquireContext() respects maxContexts and queues the request', async () => {
    const pool = new BrowserPool({ maxContexts: 1, stealthEnabled: false });

    const ctx1 = await pool.acquireContext();
    let resolved = false;
    const ctx2Promise = pool.acquireContext().then((ctx) => {
      resolved = true;
      return ctx;
    });

    await new Promise((r) => setTimeout(r, 10));
    expect(resolved).toBe(false);

    await ctx1.release();
    const ctx2 = await ctx2Promise;
    expect(resolved).toBe(true);

    await ctx2.release();
    await pool.shutdown();
  });

  it('releaseContext() returns the context to the pool', async () => {
    const pool = new BrowserPool({ maxContexts: 1, stealthEnabled: false });

    const ctx1 = await pool.acquireContext();
    const ctx2Promise = pool.acquireContext();

    await pool.releaseContext(ctx1);
    const ctx2 = await ctx2Promise;
    expect(ctx2).toBeDefined();
    // The same underlying Playwright context should be reused for ctx2
    expect(ctx2.context).toBe(ctx1.context);

    await pool.releaseContext(ctx2);
    await pool.shutdown();
  });
});
