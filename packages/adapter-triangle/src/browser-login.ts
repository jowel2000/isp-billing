import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';

export interface BrowserLoginOptions {
  /** Panel base URL, e.g. https://lisp.triangle.com.bd */
  baseUrl: string;
  username: string;
  password: string;
  /**
   * Called after the panel asks for an OTP. Must resolve with the 6-digit
   * code (typically polled from the SMS webhook table) or null on timeout.
   */
  getOtp: () => Promise<string | null>;
  headless?: boolean;
  /** Overall browser timeout budget (ms). */
  timeoutMs?: number;
  onProgress?: (step: string, message: string) => void | Promise<void>;
}

export interface BrowserLoginResult {
  accessToken: string;
  refreshToken: string | null;
  /** Raw localStorage value of lisp_trusted_browser_tokens (JSON string). */
  trustedBrowserTokens: string | null;
  currentUrl: string;
}

const DEFAULT_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

/**
 * Logs into the Triangle panel using a real headless Chromium (Playwright).
 *
 * Why: the panel's HTTP login/verify rejects plain fetch requests (511) even
 * with the correct OTP — it appears to bind the challenge to a real browser
 * context. A real browser login works reliably. After login we capture the
 * JWT from localStorage and hand it to the lightweight HTTP client, so only
 * the login step needs a browser.
 */
export async function browserLogin(options: BrowserLoginOptions): Promise<BrowserLoginResult> {
  const {
    baseUrl,
    username,
    password,
    getOtp,
    headless = true,
    timeoutMs = 180_000,
    onProgress,
  } = options;

  const base = baseUrl.replace(/\/+$/, '');
  let browser: Browser | null = null;

  const progress = async (step: string, message: string) => {
    try {
      await onProgress?.(step, message);
    } catch {
      // progress reporting must never break the login
    }
  };

  const deadline = Date.now() + timeoutMs;
  const remaining = (max: number) => Math.max(1000, Math.min(max, deadline - Date.now()));

  try {
    browser = await chromium.launch({
      headless,
      args: [
        '--no-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-extensions',
      ],
    });

    const context: BrowserContext = await browser.newContext({
      userAgent: DEFAULT_UA,
      viewport: { width: 1280, height: 800 },
      locale: 'en-US',
    });

    // Block heavy assets to keep login fast and light.
    await context.route('**/*', (route) => {
      const type = route.request().resourceType();
      if (type === 'image' || type === 'font' || type === 'media') {
        return route.abort();
      }
      return route.continue();
    });

    const page: Page = await context.newPage();
    page.setDefaultTimeout(remaining(30_000));

    await progress('browser_login', 'Opening upstream login page...');
    await page.goto(`${base}/login/`, { waitUntil: 'domcontentloaded', timeout: remaining(30_000) });

    // Wait for the login form to hydrate.
    await page.waitForSelector('#username', { timeout: remaining(20_000) });
    await page.fill('#username', username);
    await page.fill('#password', password);

    await progress('browser_login', 'Submitting credentials...');
    await Promise.all([
      page
        .waitForResponse(
          (res) => res.url().includes('/api/v1/login') && res.request().method() === 'POST',
          { timeout: remaining(30_000) },
        )
        .catch(() => null),
      page.click('button[type="submit"]'),
    ]);

    await page.waitForLoadState('networkidle', { timeout: remaining(20_000) }).catch(() => undefined);

    const otpInputs = page.locator('input[type="text"]');
    const inputCount = await otpInputs.count();
    const onOtpPage = page.url().includes('verify-otp') || inputCount >= 6;

    if (onOtpPage) {
      await progress('waiting_otp', 'Waiting for OTP SMS...');
      const otp = await getOtp();
      if (!otp) throw new Error('OTP_NOT_RECEIVED');

      await progress('verifying_otp', 'Entering the OTP in the browser...');
      await otpInputs.first().click();
      await page.keyboard.type(otp, { delay: 70 });

      await Promise.all([
        page
          .waitForResponse((res) => res.url().includes('/api/v1/verify-login-otp'), {
            timeout: remaining(30_000),
          })
          .catch(() => null),
        page.click('button:has-text("Verify & Continue")'),
      ]);

      await page.waitForLoadState('networkidle', { timeout: remaining(20_000) }).catch(() => undefined);

      // Give the SPA a moment to persist tokens to localStorage.
      await page.waitForFunction(
        () => {
          const ls = (globalThis as unknown as {
            localStorage: { getItem(key: string): string | null };
          }).localStorage;
          return Boolean(ls.getItem('access_token') || ls.getItem('token'));
        },
        undefined,
        { timeout: remaining(15_000) },
      ).catch(() => undefined);
    }

    if (page.url().includes('verify-otp')) {
      const bodyText = await page.locator('body').innerText().catch(() => '');
      throw new Error(`OTP_VERIFY_FAILED: ${bodyText.slice(0, 200)}`);
    }

    await progress('capturing_session', 'Capturing session tokens...');
    const tokens = await page.evaluate(() => {
      const ls = (globalThis as unknown as {
        localStorage: { getItem(key: string): string | null };
      }).localStorage;
      return {
        accessToken: ls.getItem('access_token') || ls.getItem('token'),
        refreshToken: ls.getItem('refreshToken') || ls.getItem('refresh_token'),
        trusted: ls.getItem('lisp_trusted_browser_tokens'),
      };
    });

    if (!tokens.accessToken) {
      throw new Error('LOGIN_SUCCEEDED_BUT_NO_TOKEN');
    }

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      trustedBrowserTokens: tokens.trusted,
      currentUrl: page.url(),
    };
  } finally {
    if (browser) {
      await browser.close().catch(() => undefined);
    }
  }
}
