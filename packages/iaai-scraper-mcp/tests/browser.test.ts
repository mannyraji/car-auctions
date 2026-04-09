import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Hoisted mocks (available in vi.mock factories) ───────────────────────────

const {
  mockPage,
  mockContext,
  mockBrowser,
  mockChromium,
  mockStealth,
  mockFsReadFile,
  mockFsWriteFile,
  mockFsMkdir,
} = vi.hoisted(() => {
  const page = {
    goto: vi.fn().mockResolvedValue(null),
    fill: vi.fn().mockResolvedValue(undefined),
    click: vi.fn().mockResolvedValue(undefined),
    waitForLoadState: vi.fn().mockResolvedValue(undefined),
    title: vi.fn().mockResolvedValue('IAAI Dashboard'),
    url: vi.fn().mockReturnValue('https://www.iaai.com/Dashboard'),
    content: vi.fn().mockResolvedValue('<html><body>Dashboard</body></html>'),
    evaluate: vi.fn().mockResolvedValue({}),
    locator: vi.fn().mockReturnValue({ count: vi.fn().mockResolvedValue(0) }),
    close: vi.fn().mockResolvedValue(undefined),
    isClosed: vi.fn().mockReturnValue(false),
    on: vi.fn(),
    mouse: {
      move: vi.fn().mockResolvedValue(undefined),
      wheel: vi.fn().mockResolvedValue(undefined),
    },
  };

  const context = {
    newPage: vi.fn().mockResolvedValue(page),
    addCookies: vi.fn().mockResolvedValue(undefined),
    cookies: vi
      .fn()
      .mockResolvedValue([{ name: 'session', value: 'abc123', domain: '.iaai.com', path: '/' }]),
    close: vi.fn().mockResolvedValue(undefined),
    pages: vi.fn().mockReturnValue([page]),
  };

  const browser = {
    newContext: vi.fn().mockResolvedValue(context),
    close: vi.fn().mockResolvedValue(undefined),
  };

  const chromium = {
    use: vi.fn(),
    launch: vi.fn().mockResolvedValue(browser),
  };

  const stealth = vi.fn().mockReturnValue({ name: 'stealth' });

  const fsReadFile = vi
    .fn()
    .mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
  const fsWriteFile = vi.fn().mockResolvedValue(undefined);
  const fsMkdir = vi.fn().mockResolvedValue(undefined);

  return {
    mockPage: page,
    mockContext: context,
    mockBrowser: browser,
    mockChromium: chromium,
    mockStealth: stealth,
    mockFsReadFile: fsReadFile,
    mockFsWriteFile: fsWriteFile,
    mockFsMkdir: fsMkdir,
  };
});

// ─── Module mocks ─────────────────────────────────────────────────────────────

vi.mock('playwright-extra', () => ({
  chromium: mockChromium,
}));

vi.mock('puppeteer-extra-plugin-stealth', () => ({
  default: mockStealth,
}));

vi.mock('fs/promises', () => ({
  default: {
    readFile: mockFsReadFile,
    writeFile: mockFsWriteFile,
    mkdir: mockFsMkdir,
  },
}));

// ─── Tests ────────────────────────────────────────────────────────────────────

import { IaaiBrowser, getBrowserInstance } from '../src/scraper/browser.js';

describe('IaaiBrowser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Re-setup mocks after clearAllMocks
    mockBrowser.newContext.mockResolvedValue(mockContext);
    mockBrowser.close.mockResolvedValue(undefined);
    mockContext.newPage.mockResolvedValue(mockPage);
    mockContext.addCookies.mockResolvedValue(undefined);
    mockContext.cookies.mockResolvedValue([
      { name: 'session', value: 'abc123', domain: '.iaai.com', path: '/' },
    ]);
    mockContext.close.mockResolvedValue(undefined);
    mockContext.pages.mockReturnValue([mockPage]);
    mockChromium.launch.mockResolvedValue(mockBrowser);
    mockStealth.mockReturnValue({ name: 'stealth' });
    mockPage.goto.mockResolvedValue(null);
    mockPage.fill.mockResolvedValue(undefined);
    mockPage.click.mockResolvedValue(undefined);
    mockPage.waitForLoadState.mockResolvedValue(undefined);
    mockPage.title.mockResolvedValue('IAAI Dashboard');
    mockPage.url.mockReturnValue('https://www.iaai.com/Dashboard');
    mockPage.content.mockResolvedValue('<html><body>Dashboard</body></html>');
    mockPage.evaluate.mockResolvedValue({});
    mockPage.locator.mockReturnValue({ count: vi.fn().mockResolvedValue(0) });
    mockPage.close.mockResolvedValue(undefined);
    mockPage.isClosed.mockReturnValue(false);
    mockFsReadFile.mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
    mockFsWriteFile.mockResolvedValue(undefined);
    mockFsMkdir.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('launch()', () => {
    it('initializes browser with stealth plugin', async () => {
      const b = new IaaiBrowser();
      await b.launch();
      expect(mockChromium.use).toHaveBeenCalledOnce();
      expect(mockStealth).toHaveBeenCalledOnce();
      expect(mockChromium.launch).toHaveBeenCalledWith(expect.objectContaining({ headless: true }));
    });

    it('does not re-launch if already initialized', async () => {
      const b = new IaaiBrowser();
      await b.launch();
      await b.launch();
      expect(mockChromium.launch).toHaveBeenCalledOnce();
    });

    it('passes PROXY_URL when env var is set', async () => {
      process.env['PROXY_URL'] = 'http://proxy.example.com:8080';
      try {
        const b = new IaaiBrowser();
        await b.launch();
        expect(mockChromium.launch).toHaveBeenCalledWith(
          expect.objectContaining({ proxy: { server: 'http://proxy.example.com:8080' } })
        );
      } finally {
        delete process.env['PROXY_URL'];
      }
    });
  });

  describe('authenticate()', () => {
    it('fills login form and saves session on success', async () => {
      const b = new IaaiBrowser();
      await b.launch();
      await b.authenticate('user@example.com', 'secret');

      expect(mockPage.goto).toHaveBeenCalledWith(
        'https://www.iaai.com/Account/Login',
        expect.objectContaining({ waitUntil: 'networkidle' })
      );
      expect(mockPage.fill).toHaveBeenCalledWith('#Email', 'user@example.com');
      expect(mockPage.fill).toHaveBeenCalledWith('#Password', 'secret');
      expect(mockPage.click).toHaveBeenCalledWith('[type="submit"]');
    });

    it('throws CaptchaError when CAPTCHA is detected before login', async () => {
      mockPage.url.mockReturnValue('https://www.iaai.com/captcha');
      const b = new IaaiBrowser();
      await b.launch();

      const { CaptchaError } = await import('@car-auctions/shared');
      await expect(b.authenticate('user@example.com', 'secret')).rejects.toThrow(CaptchaError);
    });

    it('throws CaptchaError when CAPTCHA is detected after form submit', async () => {
      // First isCaptchaPage call returns false (before form fill), second returns true (after submit)
      mockPage.url
        .mockReturnValueOnce('https://www.iaai.com/Account/Login') // before fill
        .mockReturnValueOnce('https://www.iaai.com/challenge'); // after submit

      const b = new IaaiBrowser();
      await b.launch();

      const { CaptchaError } = await import('@car-auctions/shared');
      await expect(b.authenticate('user@example.com', 'secret')).rejects.toThrow(CaptchaError);
    });

    it('throws ScraperError if browser not launched', async () => {
      const b = new IaaiBrowser();
      const { ScraperError } = await import('@car-auctions/shared');
      await expect(b.authenticate('user@example.com', 'secret')).rejects.toThrow(ScraperError);
    });
  });

  describe('restoreSession()', () => {
    it('silently succeeds when no session file exists', async () => {
      const b = new IaaiBrowser();
      await b.launch();
      // fs.readFile is mocked to reject with ENOENT — should not throw
      await expect(b.restoreSession()).resolves.toBeUndefined();
    });

    it('loads cookies and localStorage from saved session', async () => {
      const session = {
        cookies: [{ name: 'session', value: 'tok', domain: '.iaai.com', path: '/' }],
        localStorage: { 'https://www.iaai.com': { authToken: 'abc' } },
        savedAt: '2026-01-01T00:00:00.000Z',
      };
      // readFile rejects during launch() → then resolves with session for second restoreSession()
      mockFsReadFile
        .mockRejectedValueOnce(new Error('ENOENT'))
        .mockResolvedValueOnce(JSON.stringify(session));

      const b = new IaaiBrowser();
      await b.launch();
      await b.restoreSession();

      expect(mockContext.addCookies).toHaveBeenCalledWith(
        expect.arrayContaining([expect.objectContaining({ name: 'session' })])
      );
    });
  });

  describe('saveSession()', () => {
    it('writes session JSON to data/iaai-session.json', async () => {
      const b = new IaaiBrowser();
      await b.launch();
      await b.saveSession(mockPage as unknown as import('playwright').Page);

      expect(mockFsWriteFile).toHaveBeenCalledWith(
        expect.stringContaining('iaai-session.json'),
        expect.stringContaining('"savedAt"')
      );
    });
  });

  describe('close()', () => {
    it('saves session and closes browser', async () => {
      const b = new IaaiBrowser();
      await b.launch();
      await b.close();

      expect(mockFsWriteFile).toHaveBeenCalledWith(
        expect.stringContaining('iaai-session.json'),
        expect.any(String)
      );
      expect(mockContext.close).toHaveBeenCalled();
      expect(mockBrowser.close).toHaveBeenCalled();
    });
  });

  describe('getBrowserInstance()', () => {
    it('returns an IaaiBrowser instance', () => {
      const instance = getBrowserInstance();
      expect(instance).toBeInstanceOf(IaaiBrowser);
    });
  });
});
