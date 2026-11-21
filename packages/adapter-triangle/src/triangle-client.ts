import { CookieJar } from './cookie-jar';
import { RateLimiter } from './rate-limiter';
import {
  LoginResult,
  NotImplementedError,
  PanelLockedError,
  SessionExpiredError,
  TriangleApiError,
  TriangleClientOptions,
} from './types';

const LOCK_HINTS = [
  'rate-limit',
  'rate limit',
  'locked',
  'lock হয়ে',
  'সাপোর্ট আনলক',
  'Caution:',
];

export class TriangleClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly limiter: RateLimiter;
  private readonly timeoutMs: number;
  private readonly userAgent: string;
  private readonly jar = new CookieJar();

  private browserToken: string | null = null;

  constructor(options: TriangleClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 20_000;
    this.userAgent =
      options.userAgent ??
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36';
    this.limiter = new RateLimiter(
      Math.max(1, options.requestsPerMinute ?? 20),
      Math.max(1, options.requestsPerMinute ?? 20),
    );
  }

  async login(username: string, password: string): Promise<LoginResult> {
    const { data, status, text } = await this.request('/api/v1/login', {
      method: 'POST',
      body: JSON.stringify({ username, password, browser_token: this.browserToken }),
    });

    if (status === 401) {
      throw new TriangleApiError('Invalid upstream credentials', status, data ?? text);
    }

    if (status >= 400) {
      throw new TriangleApiError(`Upstream login failed (${status})`, status, data ?? text);
    }

    const otpRequired = this.detectOtpRequired(data, text);
    const token = this.extractBrowserToken(data);
    if (token) this.browserToken = token;

    return {
      otpRequired,
      cookies: this.jar.toJSON(),
      data,
    };
  }

  /**
   * Verify the SMS OTP. The exact payload is captured during Phase 0;
   * override `buildOtpPayload` if the upstream expects different fields.
   */
  async verifyOtp(code: string): Promise<LoginResult> {
    const { data, status, text } = await this.request('/api/v1/verify-login-otp', {
      method: 'POST',
      body: JSON.stringify(this.buildOtpPayload(code)),
    });

    if (status >= 400) {
      throw new TriangleApiError(`OTP verification failed (${status})`, status, data ?? text);
    }

    return {
      otpRequired: false,
      cookies: this.jar.toJSON(),
      data,
    };
  }

  restoreSession(cookies: Record<string, string>): void {
    this.jar.load(cookies);
  }

  sessionCookies(): Record<string, string> {
    return this.jar.toJSON();
  }

  hasSession(): boolean {
    return this.jar.size > 0;
  }

  async getDashboard(): Promise<unknown> {
    return this.get('/api/v1/dashboard');
  }

  async getClients(query: Record<string, string | number> = {}): Promise<unknown> {
    return this.get('/api/v1/clients', query);
  }

  async getPackages(): Promise<unknown> {
    return this.get('/api/v1/packages');
  }

  async getAreas(): Promise<unknown> {
    return this.get('/api/v1/areas');
  }

  async getLoginHistory(clientId: string): Promise<unknown> {
    return this.get(`/api/v1/clients/${encodeURIComponent(clientId)}/login-history`);
  }

  async recharge(): Promise<never> {
    throw new NotImplementedError('recharge');
  }

  private buildOtpPayload(code: string): Record<string, unknown> {
    return {
      otp: code,
      ...(this.browserToken ? { browser_token: this.browserToken } : {}),
    };
  }

  private detectOtpRequired(data: unknown, text: string): boolean {
    if (data && typeof data === 'object') {
      const record = data as Record<string, unknown>;
      if (
        record.otp_required === true ||
        record.requires_otp === true ||
        record.type === 'otp' ||
        record.type === 'two_step'
      ) {
        return true;
      }

      const payload = record.payload;
      if (payload && typeof payload === 'object') {
        const p = payload as Record<string, unknown>;
        if (p.otp_required === true || p.requires_otp === true) return true;
      }
    }

    const lower = text.toLowerCase();
    return lower.includes('otp') || lower.includes('verification code');
  }

  private extractBrowserToken(data: unknown): string | null {
    if (!data || typeof data !== 'object') return null;
    const record = data as Record<string, unknown>;
    if (typeof record.browser_token === 'string') return record.browser_token;

    const payload = record.payload;
    if (payload && typeof payload === 'object') {
      const token = (payload as Record<string, unknown>).browser_token;
      if (typeof token === 'string') return token;
    }
    return null;
  }

  private async get(
    path: string,
    query: Record<string, string | number> = {},
  ): Promise<unknown> {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      search.set(key, String(value));
    }
    const suffix = search.toString() ? `?${search.toString()}` : '';
    const { data, status, text } = await this.request(`${path}${suffix}`, { method: 'GET' });
    if (status >= 400) {
      throw new TriangleApiError(`Upstream request failed (${status})`, status, data ?? text);
    }
    return data ?? text;
  }

  private async request(
    path: string,
    init: { method: string; body?: string },
  ): Promise<{ status: number; data: unknown; text: string }> {
    await this.limiter.acquire();

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method: init.method,
        body: init.body,
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          Accept: 'application/json, text/plain, */*',
          'Content-Type': 'application/json',
          'User-Agent': this.userAgent,
          ...(this.jar.size ? { Cookie: this.jar.toHeader() } : {}),
        },
      });

      const setCookies = this.readSetCookies(response.headers);
      if (setCookies.length) this.jar.ingest(setCookies);

      const text = await response.text();
      let data: unknown = text;
      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        // Keep raw text for HTML/error pages.
      }

      if (response.status === 429 || this.looksLocked(text)) {
        throw new PanelLockedError();
      }

      if (response.status === 401) {
        // Login uses 401 for bad credentials; callers handle it. For other
        // endpoints this means the session expired.
        if (path !== '/api/v1/login') {
          throw new SessionExpiredError();
        }
      }

      return { status: response.status, data, text };
    } finally {
      clearTimeout(timeout);
    }
  }

  private looksLocked(text: string): boolean {
    return LOCK_HINTS.some((hint) => text.includes(hint));
  }

  private readSetCookies(headers: Headers): string[] {
    const withHelper = headers as Headers & { getSetCookie?: () => string[] };
    if (typeof withHelper.getSetCookie === 'function') {
      return withHelper.getSetCookie();
    }
    const single = headers.get('set-cookie');
    return single ? [single] : [];
  }
}
