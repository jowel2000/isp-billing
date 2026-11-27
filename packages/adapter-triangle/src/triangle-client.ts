import { CookieJar } from './cookie-jar';
import { RateLimiter } from './rate-limiter';
import {
  LoginResult,
  NotImplementedError,
  PanelLockedError,
  SessionExpiredError,
  TriangleApiError,
  TriangleClientOptions,
  UpstreamBusinessError,
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
  private challengeToken: string | null = null;
  private accessToken: string | null = null;
  private refreshToken: string | null = null;
  private username = '';
  private password = '';

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
    this.username = username;
    this.password = password;

    const { data, status, text } = await this.request('/api/v1/login', {
      method: 'POST',
      body: JSON.stringify({
        username,
        password,
        browser_token: this.browserToken,
        // The panel sends a challenge token back on repeated login attempts.
        ...(this.challengeToken ? { challenge_token: this.challengeToken } : {}),
      }),
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

    const challenge = this.extractChallengeToken(data);
    if (challenge) this.challengeToken = challenge;

    this.captureTokens(data);

    return {
      otpRequired,
      cookies: this.jar.toJSON(),
      data,
    };
  }

  /**
   * Verify the SMS OTP using the real panel contract:
   *   { username, password, otp, browser_token, challenge_token }
   * (discovered from the upstream panel's own JS bundle).
   */
  async verifyOtp(code: string): Promise<LoginResult> {
    const { data, status, text } = await this.request('/api/v1/verify-login-otp', {
      method: 'POST',
      body: JSON.stringify(this.buildOtpPayload(code)),
    });

    if (status >= 400) {
      throw new TriangleApiError(`OTP verification failed (${status})`, status, data ?? text);
    }

    this.captureTokens(data);

    return {
      otpRequired: false,
      cookies: this.jar.toJSON(),
      data,
    };
  }

  restoreSession(cookies: Record<string, string>): void {
    this.jar.load(cookies);
  }

  /** Restores the login credentials needed by the OTP verify payload. */
  restoreCredentials(username: string, password: string): void {
    this.username = username;
    this.password = password;
  }

  /** Restores the browser/challenge tokens captured during the login step. */
  restoreOtpChallenge(challengeToken: string | null, browserToken: string | null): void {
    this.challengeToken = challengeToken;
    this.browserToken = browserToken;
  }

  restoreAuthTokens(accessToken: string | null, refreshToken: string | null): void {
    this.accessToken = accessToken;
    this.refreshToken = refreshToken;
  }

  getChallengeToken(): string | null {
    return this.challengeToken;
  }

  getBrowserToken(): string | null {
    return this.browserToken;
  }

  getAccessToken(): string | null {
    return this.accessToken;
  }

  getRefreshToken(): string | null {
    return this.refreshToken;
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

  async getSetupPackages(query: Record<string, string | number> = {}): Promise<unknown> {
    return this.get('/api/v1/setup/packages', query);
  }

  async getAreas(): Promise<unknown> {
    return this.get('/api/v1/areas');
  }

  async getSetupAreas(query: Record<string, string | number> = {}): Promise<unknown> {
    return this.get('/api/v1/setup/areas', query);
  }

  async getLoginHistory(clientId: string): Promise<unknown> {
    return this.get(`/api/v1/clients/${encodeURIComponent(clientId)}/login-history`);
  }

  /**
   * POST /api/v1/clients/recharge/{uuid}
   * Verified live (Nov 2026): body is exactly { days, comment }.
   * The server calculates the deduction amount and new expiry — never send amount.
   * Success: { success:true, code:'S01', payload:'Success fully recharge' }
   * Business error (e.g. insufficient balance): HTTP 511 / code E01.
   */
  async recharge(uuid: string, days: number, comment = ''): Promise<unknown> {
    const { data, status, text } = await this.request(
      `/api/v1/clients/recharge/${encodeURIComponent(uuid)}`,
      { method: 'POST', body: JSON.stringify({ days, comment }) },
    );
    return data ?? text ?? { status };
  }

  /** GET /api/v1/clients/recharge-info/{uuid} — balance + duration options. */
  async getRechargeInfo(uuid: string): Promise<unknown> {
    return this.get(`/api/v1/clients/recharge-info/${encodeURIComponent(uuid)}`);
  }

  /**
   * GET /api/v1/clients/recharge-by-days/{uuid}/days/{n}
   * Preview only — does NOT recharge. Optional start_date/end_date for custom ranges.
   */
  async getRechargeByDays(
    uuid: string,
    days: number,
    start_date?: string,
    end_date?: string,
  ): Promise<unknown> {
    const query: Record<string, string | number> = {};
    if (start_date) query.start_date = start_date;
    if (end_date) query.end_date = end_date;
    return this.get(
      `/api/v1/clients/recharge-by-days/${encodeURIComponent(uuid)}/days/${days}`,
      query,
    );
  }

  /** GET /api/v1/clients/recharge-history/{uuid}?page=&per_page= */
  async getRechargeHistory(uuid: string, page = 1, perPage = 10): Promise<unknown> {
    return this.get(`/api/v1/clients/recharge-history/${encodeURIComponent(uuid)}`, {
      page,
      per_page: perPage,
    });
  }

  private buildOtpPayload(code: string): Record<string, unknown> {
    return {
      username: this.username,
      password: this.password,
      otp: code,
      browser_token: this.browserToken,
      ...(this.challengeToken ? { challenge_token: this.challengeToken } : {}),
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

  private extractChallengeToken(data: unknown): string | null {
    if (!data || typeof data !== 'object') return null;
    const record = data as Record<string, unknown>;
    if (typeof record.challenge_token === 'string') return record.challenge_token;

    const payload = record.payload;
    if (payload && typeof payload === 'object') {
      const token = (payload as Record<string, unknown>).challenge_token;
      if (typeof token === 'string') return token;
    }
    return null;
  }

  private captureTokens(data: unknown) {
    const access = this.extractToken(data, 'access_token');
    const refresh = this.extractToken(data, 'refresh_token');
    if (access) this.accessToken = access;
    if (refresh) this.refreshToken = refresh;
  }

  private extractToken(data: unknown, key: 'access_token' | 'refresh_token'): string | null {
    if (!data || typeof data !== 'object') return null;
    const record = data as Record<string, unknown>;
    if (typeof record[key] === 'string') return record[key] as string;

    const payload = record.payload;
    if (payload && typeof payload === 'object') {
      const token = (payload as Record<string, unknown>)[key];
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
    allowRefresh = true,
  ): Promise<{ status: number; data: unknown; text: string }> {
    await this.limiter.acquire();

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    const isAuthPath =
      path === '/api/v1/login' ||
      path === '/api/v1/verify-login-otp' ||
      path === '/api/v1/refresh-token';

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
          ...(this.accessToken && !isAuthPath
            ? { Authorization: `Bearer ${this.accessToken}` }
            : {}),
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

      // HTTP 511 / code E01 = business error (e.g. insufficient balance on
      // recharge, invalid OTP). Must not be retried blindly.
      const bodyRecord = data && typeof data === 'object' ? (data as Record<string, unknown>) : null;
      if (response.status === 511 || bodyRecord?.code === 'E01') {
        const message =
          (bodyRecord?.message as string) ??
          ((bodyRecord?.payload as Record<string, unknown> | undefined)?.message as string) ??
          'Upstream business error';
        throw new UpstreamBusinessError(message);
      }

      // Expired access token: refresh once, then retry the request.
      if (response.status === 401) {
        if (!isAuthPath) {
          if (allowRefresh && this.refreshToken) {
            const refreshed = await this.refreshAccessToken();
            if (refreshed) return this.request(path, init, false);
          }
          throw new SessionExpiredError();
        }
      }

      return { status: response.status, data, text };
    } finally {
      clearTimeout(timeout);
    }
  }

  private async refreshAccessToken(): Promise<boolean> {
    if (!this.refreshToken) return false;
    try {
      const { status, data } = await this.request(
        '/api/v1/refresh-token',
        {
          method: 'POST',
          body: JSON.stringify({ refresh_token: this.refreshToken }),
        },
        false,
      );
      if (status >= 400) return false;
      this.captureTokens(data);
      return Boolean(this.accessToken);
    } catch {
      return false;
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
