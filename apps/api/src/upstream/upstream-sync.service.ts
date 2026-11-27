import {
  BadRequestException,
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  PanelLockedError,
  SessionExpiredError,
  TriangleApiError,
  TriangleClient,
  UpstreamBusinessError,
  browserLogin,
} from '@isp/adapter-triangle';
import { decryptString, encryptString } from '../common/crypto';
import { extractOtpCode } from '../webhooks/sms-parser.service';
import { PrismaService } from '../prisma/prisma.service';
import { SyncStatusService } from '../sync/sync-status.service';
import { OtpWindowService } from './otp-window.service';

interface SyncReport {
  status: 'completed' | 'otp_required' | 'failed' | 'busy' | 'locked' | 'cooldown';
  lastUpdatedAt: string | null;
  packages: { fetched: number; created: number; updated: number };
  areas: { fetched: number; created: number; updated: number };
  clients: { fetched: number; created: number; updated: number };
  loginHistory: { fetched: number; created: number };
  errors: string[];
  note?: string;
  retryAfterSeconds?: number;
}

const PENDING_OTP_TTL_MS = 5 * 60 * 1000;
const DEFAULT_LOGIN_COOLDOWN_MINUTES = 5;

function asList(payload: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(payload)) return payload as Array<Record<string, unknown>>;
  if (payload && typeof payload === 'object') {
    const record = payload as Record<string, unknown>;
    for (const key of ['data', 'items', 'results', 'payload']) {
      const value = record[key];
      if (Array.isArray(value)) return value as Array<Record<string, unknown>>;
      if (value && typeof value === 'object') {
        const inner = (value as Record<string, unknown>)['data'] ?? (value as Record<string, unknown>)['items'];
        if (Array.isArray(inner)) return inner as Array<Record<string, unknown>>;
      }
    }
  }
  return [];
}

function str(value: unknown): string {
  return value === null || value === undefined ? '' : String(value).trim();
}

/**
 * Extracts rows + pagination from the upstream response shapes:
 *   { payload: { data: [...] } }
 *   { payload: { data: { data: [...], total, last_page } } }
 */
function extractList(payload: unknown): {
  rows: Array<Record<string, unknown>>;
  lastPage: number;
} {
  const root = (payload ?? {}) as Record<string, any>;
  const candidates = [
    root?.payload?.data?.data,
    root?.payload?.data,
    root?.data?.data,
    root?.data,
    root?.payload?.items,
    root?.items,
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      const innerMeta = root?.payload?.data;
      const meta =
        innerMeta &&
        typeof innerMeta === 'object' &&
        !Array.isArray(innerMeta) &&
        (innerMeta.total !== undefined || innerMeta.last_page !== undefined)
          ? innerMeta
          : (root?.payload ?? root?.data ?? root ?? {});
      const total = Number(meta?.total ?? 0) || 0;
      const perPage = Number(meta?.per_page ?? 0) || 100;
      const lastPage =
        Number(meta?.last_page ?? 0) ||
        (total > 0 ? Math.ceil(total / perPage) : 1) ||
        1;
      return { rows: candidate as Array<Record<string, unknown>>, lastPage };
    }
  }

  return { rows: [], lastPage: 1 };
}

function toPaisa(value: unknown): bigint | null {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return BigInt(Math.round(number * 100));
}

@Injectable()
export class UpstreamSyncService implements OnModuleInit {
  private readonly logger = new Logger('UpstreamSync');
  private autoTimer: NodeJS.Timeout | null = null;
  private scheduledTimer: NodeJS.Timeout | null = null;
  private readonly scheduledRunDates = new Map<string, string>();
  private readonly busy = new Set<string>();

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly syncStatus: SyncStatusService,
    private readonly otpWindows: OtpWindowService,
  ) {}

  onModuleInit() {
    this.startAutoSyncIfEnabled();
    this.startScheduledTimesSync();
  }

  private get credentials() {
    return {
      baseUrl: (this.config.get<string>('TRIANGLE_BASE_URL') || 'https://lisp.triangle.com.bd').replace(/\/+$/, ''),
      username: this.config.get<string>('TRIANGLE_USERNAME') || '',
      password: this.config.get<string>('TRIANGLE_PASSWORD') || '',
    };
  }

  private newClient(): TriangleClient {
    return new TriangleClient({
      baseUrl: this.credentials.baseUrl,
      requestsPerMinute: 15,
      timeoutMs: 25_000,
    });
  }

  private async rememberLoginAttempt(tenantId: string) {
    await this.prisma.setting.upsert({
      where: { tenantId_key: { tenantId, key: 'upstream_last_login_attempt' } },
      update: { value: String(Date.now()) },
      create: { tenantId, key: 'upstream_last_login_attempt', value: String(Date.now()) },
    });
  }

  private async lastLoginAttemptAt(tenantId: string): Promise<number> {
    const row = await this.prisma.setting.findUnique({
      where: { tenantId_key: { tenantId, key: 'upstream_last_login_attempt' } },
    });
    return row?.value ? Number(row.value) : 0;
  }

  private loginCooldownMs(): number {
    const raw = Number(
      this.config.get<string>('UPSTREAM_LOGIN_COOLDOWN_MINUTES'),
    );
    const minutes =
      Number.isFinite(raw) && raw >= 1
        ? Math.min(raw, 60)
        : DEFAULT_LOGIN_COOLDOWN_MINUTES;
    return minutes * 60 * 1000;
  }

  private async loginCooldownRemaining(tenantId: string): Promise<number> {
    const lastAttempt = await this.lastLoginAttemptAt(tenantId);
    if (!lastAttempt) return 0;
    return Math.max(0, lastAttempt + this.loginCooldownMs() - Date.now());
  }

  /** True when Refresh can reuse an active session or a fresh pending login. */
  private async hasReusableSession(tenantId: string): Promise<boolean> {
    const active = await this.prisma.upstreamSession.findFirst({
      where: { tenantId, status: 'active' },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
    if (active) return true;

    const pending = await this.prisma.upstreamSession.findFirst({
      where: { tenantId, status: 'pending_otp' },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });
    return Boolean(
      pending && Date.now() - pending.createdAt.getTime() < PENDING_OTP_TTL_MS,
    );
  }

  /**
   * Session payload envelope: cookies + the OTP challenge/browser tokens.
   * Older rows stored plain cookies JSON — both shapes are accepted.
   */
  private parseSessionEnvelope(cookieEnc: string): {
    cookies: Record<string, string>;
    challengeToken: string | null;
    browserToken: string | null;
    accessToken: string | null;
    refreshToken: string | null;
  } {
    try {
      const parsed = JSON.parse(decryptString(cookieEnc));
      if (parsed && typeof parsed === 'object' && 'cookies' in parsed) {
        return {
          cookies: (parsed.cookies ?? {}) as Record<string, string>,
          challengeToken: (parsed.challengeToken ?? null) as string | null,
          browserToken: (parsed.browserToken ?? null) as string | null,
          accessToken: (parsed.accessToken ?? null) as string | null,
          refreshToken: (parsed.refreshToken ?? null) as string | null,
        };
      }
      return {
        cookies: (parsed ?? {}) as Record<string, string>,
        challengeToken: null,
        browserToken: null,
        accessToken: null,
        refreshToken: null,
      };
    } catch {
      return {
        cookies: {},
        challengeToken: null,
        browserToken: null,
        accessToken: null,
        refreshToken: null,
      };
    }
  }

  private sessionEnvelope(client: TriangleClient): string {
    return encryptString(
      JSON.stringify({
        cookies: client.sessionCookies(),
        challengeToken: client.getChallengeToken(),
        browserToken: client.getBrowserToken(),
        accessToken: client.getAccessToken(),
        refreshToken: client.getRefreshToken(),
      }),
    );
  }

  /** Session envelope built from browser-captured tokens. */
  private sessionEnvelopeFromTokens(
    accessToken: string,
    refreshToken: string | null,
    browserTokens: string | null,
  ): string {
    return encryptString(
      JSON.stringify({
        cookies: {},
        challengeToken: null,
        browserToken: browserTokens,
        accessToken,
        refreshToken,
      }),
    );
  }

  /** http (default) | browser | auto */
  private loginMode(): 'http' | 'browser' | 'auto' {
    const raw = (this.config.get<string>('TRIANGLE_LOGIN_MODE') || 'http').toLowerCase();
    return raw === 'browser' || raw === 'auto' ? raw : 'http';
  }

  /**
   * Playwright-based login. Used when the plain HTTP login/verify is rejected
   * (the panel binds the OTP challenge to a real browser context).
   *
   * Flow:
   *  1. reuse an active stored session if it still works
   *  2. start an OTP window (so the SMS webhook accepts the OTP)
   *  3. open a real Chromium, submit credentials
   *  4. poll the DB for the forwarded OTP and type it in the browser
   *  5. capture access_token + refreshToken from localStorage
   */
  private async ensureBrowserSession(
    tenantId: string,
    client: TriangleClient,
    runId: string | null,
    meta: { trigger: 'manual' | 'auto'; userId?: string },
  ): Promise<'ok' | 'otp_required'> {
    // 1. Reuse an active session when possible.
    const active = await this.prisma.upstreamSession.findFirst({
      where: { tenantId, status: 'active' },
      orderBy: { createdAt: 'desc' },
    });
    if (active?.cookieEnc) {
      try {
        const envelope = this.parseSessionEnvelope(active.cookieEnc);
        if (envelope.accessToken) {
          client.restoreAuthTokens(envelope.accessToken, envelope.refreshToken);
          client.restoreOtpChallenge(envelope.challengeToken, envelope.browserToken);
          await client.getDashboard();
          await this.prisma.upstreamSession.update({
            where: { id: active.id },
            data: { lastVerifiedAt: new Date() },
          });
          return 'ok';
        }
      } catch {
        // expired — fall through to a fresh browser login
      }
    }

    // 2. Open an OTP window so the SMS webhook stores the forwarded code.
    const window = await this.otpWindows.start(tenantId, {
      trigger: meta.trigger,
      userId: meta.userId,
    });
    const startedAt = new Date();
    await this.rememberLoginAttempt(tenantId);

    if (runId) {
      await this.syncStatus.step(runId, 'browser_login', 'Launching headless browser...', 12);
    }

    let result;
    try {
      result = await browserLogin({
        baseUrl: this.credentials.baseUrl,
        username: this.credentials.username,
        password: this.credentials.password,
        headless: this.config.get<string>('PLAYWRIGHT_HEADLESS') !== 'false',
        timeoutMs: 180_000,
        getOtp: () => this.waitForOtpFromDb(tenantId, startedAt),
        onProgress: async (step, message) => {
          if (!runId) return;
          const mapped =
            step === 'waiting_otp'
              ? 'waiting_otp'
              : step === 'verifying_otp'
                ? 'verifying_otp'
                : step === 'capturing_session'
                  ? 'login_success'
                  : 'browser_login';
          await this.syncStatus.step(runId, mapped, message, 25).catch(() => undefined);
        },
      });
    } catch (error) {
      await this.otpWindows.fail(window.id, (error as Error).message).catch(() => undefined);
      this.logger.warn(`Browser login failed: ${(error as Error).message}`);
      return 'otp_required';
    }

    await this.otpWindows.supersede(tenantId, 'session_reused').catch(() => undefined);
    await this.prisma.upstreamSession.create({
      data: {
        tenantId,
        cookieEnc: this.sessionEnvelopeFromTokens(
          result.accessToken,
          result.refreshToken,
          result.trustedBrowserTokens,
        ),
        status: 'active',
        lastVerifiedAt: new Date(),
      },
    });
    client.restoreAuthTokens(result.accessToken, result.refreshToken);
    return 'ok';
  }

  /** Polls SmsInbound for a forwarded OTP that arrived after `since`. */
  private async waitForOtpFromDb(tenantId: string, since: Date): Promise<string | null> {
    const deadline = Date.now() + 5 * 60 * 1000;
    while (Date.now() < deadline) {
      const sms = await this.prisma.smsInbound.findFirst({
        where: {
          tenantId,
          kind: 'otp',
          createdAt: { gte: since },
        },
        orderBy: { createdAt: 'desc' },
        select: { body: true, otpCode: true },
      });
      if (sms) {
        if (sms.otpCode) return sms.otpCode;
        const extracted = extractOtpCode(sms.body ?? '');
        if (extracted.code) return extracted.code;
      }
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
    return null;
  }

  private async saveActiveSession(tenantId: string, client: TriangleClient) {
    await this.prisma.upstreamSession.create({
      data: {
        tenantId,
        cookieEnc: this.sessionEnvelope(client),
        status: 'active',
        lastVerifiedAt: new Date(),
      },
    });
  }

  /**
   * Returns 'ok' when a working session is ready, or 'otp_required' when the
   * login needs an SMS OTP (without spamming new logins).
   */
  private async ensureSession(
    tenantId: string,
    client: TriangleClient,
    runId?: string | null,
    meta: { trigger: 'manual' | 'auto'; userId?: string } = { trigger: 'manual' },
  ): Promise<'ok' | 'otp_required' | 'cooldown'> {
    // Expire stale pending sessions (older than 7 days) so they do not pile up.
    await this.prisma.upstreamSession
      .updateMany({
        where: {
          tenantId,
          status: 'pending_otp',
          createdAt: { lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
        },
        data: { status: 'expired' },
      })
      .catch(() => undefined);

    // 1. Reuse the last active session.
    const active = await this.prisma.upstreamSession.findFirst({
      where: { tenantId, status: 'active' },
      orderBy: { createdAt: 'desc' },
    });
    if (active?.cookieEnc) {
      try {
        const envelope = this.parseSessionEnvelope(active.cookieEnc);
        client.restoreSession(envelope.cookies);
        client.restoreOtpChallenge(envelope.challengeToken, envelope.browserToken);
        client.restoreAuthTokens(envelope.accessToken, envelope.refreshToken);
        await client.getDashboard();
        await this.prisma.upstreamSession.update({
          where: { id: active.id },
          data: { lastVerifiedAt: new Date() },
        });
        return 'ok';
      } catch {
        // Session expired — fall through.
      }
    }

    // 2. An OTP was already requested and is still fresh: wait for the SMS
    //    instead of requesting another one.
    const pending = await this.prisma.upstreamSession.findFirst({
      where: { tenantId, status: 'pending_otp' },
      orderBy: { createdAt: 'desc' },
    });
    if (pending && Date.now() - pending.createdAt.getTime() < PENDING_OTP_TTL_MS) {
      // A pending session from before the OTP-window feature has no window.
      // Reconstruct it from the original request time so a forwarded OTP is
      // not rejected with OTP_NO_WINDOW.
      await this.otpWindows.recoverStale(tenantId);
      const activeWindow = await this.prisma.otpWindow.findFirst({
        where: { tenantId, status: 'pending' },
        orderBy: { requestedAt: 'desc' },
      });
      if (!activeWindow) {
        await this.otpWindows.start(
          tenantId,
          { trigger: meta.trigger, userId: meta.userId },
          pending.createdAt,
        );
      }

      if (runId) {
        await this.syncStatus.step(
          runId,
          'waiting_otp',
          'Waiting for OTP SMS — forward it from your phone',
          15,
        );
      }
      return 'otp_required';
    }

    // 3. Cooldown: never attempt a fresh login more often than the
    // configurable interval (default 5 minutes).
    const cooldownRemaining = await this.loginCooldownRemaining(tenantId);
    if (cooldownRemaining > 0) {
      if (runId) {
        await this.syncStatus.step(
          runId,
          'waiting_otp',
          `Login cooldown active — retry in ${Math.ceil(cooldownRemaining / 1000)}s`,
          15,
        );
      }
      return 'otp_required';
    }

    // 4. Fresh login attempt (this triggers ONE OTP SMS from Triangle).
    if (runId) {
      await this.syncStatus.step(runId, 'sending_otp', 'Sending OTP...', 10);
    }

    // Record the exact OTP request time BEFORE the upstream call so the
    // acceptance window starts at the moment the OTP is requested. A newer
    // Refresh/auto-send supersedes this window.
    const window = await this.otpWindows.start(tenantId, {
      trigger: meta.trigger,
      userId: meta.userId,
    });

    const { username, password } = this.credentials;
    let login;
    try {
      login = await client.login(username, password);
    } catch (error) {
      await this.otpWindows.fail(window.id, (error as Error).message);
      throw error;
    }
    await this.rememberLoginAttempt(tenantId);

    if (login.otpRequired) {
      await this.prisma.upstreamSession.create({
        data: {
          tenantId,
          cookieEnc: this.sessionEnvelope(client),
          status: 'pending_otp',
        },
      });
      return 'otp_required';
    }

    // Login succeeded without an OTP (upstream session was still valid).
    await this.otpWindows.supersede(tenantId, 'session_reused');
    await this.saveActiveSession(tenantId, client);
    return 'ok';
  }

  /**
   * Manual/auto sync entry point. Fast: when an OTP is required it returns
   * immediately — the forwarded SMS completes the flow via
   * `completeLoginAndSync`.
   */
  async sync(
    tenantId: string,
    scope: { clients?: boolean; packages?: boolean; areas?: boolean; loginHistory?: boolean } = {},
    meta: { trigger?: 'manual' | 'auto'; userId?: string } = {},
  ): Promise<SyncReport> {
    const empty = (): SyncReport => ({
      status: 'completed',
      lastUpdatedAt: null,
      packages: { fetched: 0, created: 0, updated: 0 },
      areas: { fetched: 0, created: 0, updated: 0 },
      clients: { fetched: 0, created: 0, updated: 0 },
      loginHistory: { fetched: 0, created: 0 },
      errors: [],
    });

    const lockUntil = await this.syncStatus.lockedUntil(tenantId);
    if (lockUntil) {
      return {
        ...empty(),
        status: 'locked',
        note: `Upstream panel is locked until ${lockUntil}. Contact Triangle support.`,
        errors: [`UPSTREAM_LOCKED until ${lockUntil}`],
      };
    }

    // A refresh during cooldown must not create a 5-minute waiting run with no
    // active OTP window. Reusing an active/fresh session is still allowed.
    const cooldownRemaining = await this.loginCooldownRemaining(tenantId);
    if (cooldownRemaining > 0 && !(await this.hasReusableSession(tenantId))) {
      const seconds = Math.ceil(cooldownRemaining / 1000);
      return {
        ...empty(),
        status: 'cooldown',
        retryAfterSeconds: seconds,
        note: `Login cooldown active — retry in ${seconds}s`,
      };
    }

    const { run, busy } = await this.syncStatus.start(
      tenantId,
      meta.trigger ?? 'manual',
      meta.userId,
    );
    if (busy) {
      return {
        ...empty(),
        status: 'busy',
        note: 'Another sync is already running for this panel.',
      };
    }

    try {
      const { username, password } = this.credentials;
      if (!username || !password) {
        const input = {
          step: 'queued',
          code: 'CONFIG_MISSING',
          message: 'TRIANGLE_USERNAME / TRIANGLE_PASSWORD are not configured',
        };
        await this.syncStatus.fail(run.id, tenantId, input);
        return { ...empty(), status: 'failed', note: input.code, errors: [input.message] };
      }

      const client = this.newClient();
      const mode = this.loginMode();

      let state: 'ok' | 'otp_required' | 'cooldown';
      if (mode === 'browser') {
        state = await this.ensureBrowserSession(tenantId, client, run.id, {
          trigger: meta.trigger ?? 'manual',
          userId: meta.userId,
        });
      } else {
        await this.syncStatus.step(run.id, 'sending_otp', 'Sending OTP...', 10);
        state = await this.ensureSession(tenantId, client, run.id, {
          trigger: meta.trigger ?? 'manual',
          userId: meta.userId,
        });
      }

      if (state !== 'ok') {
        await this.syncStatus.step(
          run.id,
          'waiting_otp',
          'Waiting for OTP SMS — forward it from your phone',
          15,
        );
        const report = empty();
        report.status = 'otp_required';
        report.note =
          'OTP requested — when the forwarded SMS arrives the sync completes automatically. New logins are rate-limited to avoid SMS spam.';
        return report;
      }

      await this.syncStatus.step(run.id, 'login_success', 'Login successful', 35);

      const doScope = {
        clients: scope.clients ?? true,
        packages: scope.packages ?? true,
        areas: scope.areas ?? true,
        loginHistory: scope.loginHistory ?? false,
      };

      const report = await this.scrapeAll(tenantId, client, doScope, run.id);
      await this.markUpdated(tenantId, report);
      await this.persistJob(tenantId, report);

      if (report.errors.length > 0) {
        await this.syncStatus.fail(run.id, tenantId, {
          step: 'uploading',
          code: 'SCRAPE_PARTIAL',
          message: 'Some data could not be synced',
          detail: report.errors,
        });
        report.status = 'failed';
        report.note = 'SCRAPE_PARTIAL';
        return report;
      }

      await this.syncStatus.finish(run.id, tenantId, report);
      return report;
    } catch (error) {
      const mapped = this.mapError(error, 'sync');
      if (mapped.code === 'UPSTREAM_LOCKED') {
        await this.syncStatus.lockPanel(tenantId, 24);
      }
      await this.syncStatus.fail(run.id, tenantId, mapped);
      return { ...empty(), status: 'failed', note: mapped.code, errors: [mapped.message] };
    }
  }

  /** Maps adapter errors to a code/step/detail for the error log. */
  private mapError(
    error: unknown,
    defaultStep: string,
  ): {
    step: string;
    code: string;
    message: string;
    detail: unknown;
    httpStatus: number | null;
  } {
    if (error instanceof TriangleApiError) {
      const body = error.body as
        | { message?: string; payload?: unknown; code?: string }
        | null
        | undefined;
      const text = JSON.stringify(body ?? '');
      const message = body?.message || error.message;

      if (error.status === 403 && /(lock|লক|administrative)/i.test(text)) {
        return {
          step: 'verifying_otp',
          code: 'UPSTREAM_LOCKED',
          message:
            body?.message ||
            'Upstream panel is administratively locked due to excessive requests',
          detail: body,
          httpStatus: 403,
        };
      }
      if (error.status === 422) {
        return {
          step: 'verifying_otp',
          code: 'OTP_422',
          message,
          detail: body,
          httpStatus: 422,
        };
      }
      if (error.status === 401) {
        return {
          step: defaultStep,
          code: 'AUTH_401',
          message,
          detail: body,
          httpStatus: 401,
        };
      }
      return {
        step: defaultStep,
        code: `HTTP_${error.status}`,
        message,
        detail: body,
        httpStatus: error.status,
      };
    }

    if (error instanceof PanelLockedError) {
      return {
        step: defaultStep,
        code: 'PANEL_LOCKED',
        message: error.message,
        detail: null,
        httpStatus: 429,
      };
    }

    if (error instanceof SessionExpiredError) {
      return {
        step: defaultStep,
        code: 'SESSION_EXPIRED',
        message: error.message,
        detail: null,
        httpStatus: 401,
      };
    }

    if (error instanceof UpstreamBusinessError) {
      return {
        step: defaultStep,
        code: 'UPSTREAM_BUSINESS_ERROR',
        message: error.message,
        detail: null,
        httpStatus: 511,
      };
    }

    if ((error as { name?: string })?.name === 'AbortError') {
      return {
        step: defaultStep,
        code: 'NETWORK_TIMEOUT',
        message: 'Upstream request timed out',
        detail: null,
        httpStatus: null,
      };
    }

    return {
      step: defaultStep,
      code: 'SYNC_FAILED',
      message: (error as Error)?.message || 'Unknown sync failure',
      detail: null,
      httpStatus: null,
    };
  }

  /**
   * Called when a forwarded SMS contains an OTP: verifies it with Triangle,
   * saves the session and immediately scrapes + updates all data.
   */
  async completeLoginAndSync(tenantId: string, windowId?: string) {
    if (this.busy.has(tenantId)) return { status: 'busy' as const };
    this.busy.add(tenantId);
    let runId: string | null = null;
    let activeWindow: { id: string; attempts: number } | null = null;

    try {
      await this.otpWindows.recoverStale(tenantId);

      const running = await this.syncStatus.findRunning(tenantId);
      const run = running ?? (await this.syncStatus.start(tenantId, 'otp')).run;
      runId = run.id;

      await this.syncStatus.step(
        runId,
        'verifying_otp',
        'Verifying OTP & Logging in...',
        25,
      );

      const pending = await this.prisma.upstreamSession.findFirst({
        where: { tenantId, status: 'pending_otp' },
        orderBy: { createdAt: 'desc' },
      });

      // Prefer the OTP attached to the claimed window. Fall back to the legacy
      // OtpRequest row ONLY for legacy callers that did not pass a windowId.
      let otpCode: string | null = null;
      let windowBlocked:
        | { code: string; status: 'expired' | 'superseded' }
        | null = null;

      if (windowId) {
        let window = await this.otpWindows.byId(tenantId, windowId);
        if (window?.status === 'pending') {
          const claimed = await this.otpWindows.claim(window.id);
          if (claimed) window = await this.otpWindows.byId(tenantId, window.id);
        }

        if (window && window.status === 'verifying') {
          activeWindow = { id: window.id, attempts: window.attempts };
          const sms = await this.prisma.smsInbound.findFirst({
            where: {
              tenantId,
              otpWindowId: window.id,
              kind: 'otp',
              status: 'otp',
              otpCode: { not: null },
            },
            orderBy: { createdAt: 'desc' },
            select: { otpCode: true },
          });
          otpCode = sms?.otpCode ?? null;
        } else {
          const code =
            window?.status === 'expired'
              ? 'OTP_EXPIRED'
              : window?.status === 'consumed'
                ? 'OTP_ALREADY_CONSUMED'
                : window?.status === 'failed'
                  ? 'OTP_WINDOW_FAILED'
                  : 'OTP_SUPERSEDED';
          windowBlocked = {
            code,
            status: code === 'OTP_EXPIRED' ? 'expired' : 'superseded',
          };
        }
      }

      let legacyOtpId: string | null = null;
      if (!otpCode && !windowId) {
        const otpRow = await this.prisma.otpRequest.findFirst({
          where: {
            tenantId,
            context: 'triangle_login',
            status: 'pending',
            expiresAt: { gt: new Date() },
          },
          orderBy: { requestedAt: 'desc' },
          select: { id: true, codeEnc: true },
        });
        if (otpRow?.codeEnc) {
          otpCode = decryptString(otpRow.codeEnc);
          legacyOtpId = otpRow.id;
        }
      }

      if (windowBlocked) {
        await this.syncStatus.fail(runId, tenantId, {
          step: 'verifying_otp',
          code: windowBlocked.code,
          message:
            windowBlocked.code === 'OTP_EXPIRED'
              ? 'OTP window expired before verification'
              : 'A newer OTP request superseded this one',
        });
        return { status: windowBlocked.status, error: windowBlocked.code };
      }

      if (!pending?.cookieEnc || !otpCode) {
        const input = {
          step: 'verifying_otp',
          code: 'OTP_MISSING',
          message: 'No pending OTP or pending login session found',
        };
        await this.syncStatus.fail(runId, tenantId, input);
        if (activeWindow) {
          await this.otpWindows.fail(activeWindow.id, input.message);
        }
        return { status: 'nothing_to_do' as const, error: input.code };
      }

      if (activeWindow) {
        const window = await this.otpWindows.byId(tenantId, activeWindow.id);
        if (!window || window.status !== 'verifying') {
          await this.syncStatus.fail(runId, tenantId, {
            step: 'verifying_otp',
            code: 'OTP_SUPERSEDED',
            message: 'A newer OTP request superseded this one',
          });
          return { status: 'superseded' as const, error: 'OTP_SUPERSEDED' };
        }
        if (window.expiresAt.getTime() <= Date.now()) {
          await this.otpWindows.fail(window.id, 'OTP window expired');
          await this.syncStatus.fail(runId, tenantId, {
            step: 'verifying_otp',
            code: 'OTP_EXPIRED',
            message: 'OTP window expired before verification',
          });
          return { status: 'expired' as const, error: 'OTP_EXPIRED' };
        }
      }

      const envelope = this.parseSessionEnvelope(pending.cookieEnc);
      const client = this.newClient();
      client.restoreSession(envelope.cookies);
      client.restoreOtpChallenge(envelope.challengeToken, envelope.browserToken);
      client.restoreAuthTokens(envelope.accessToken, envelope.refreshToken);
      // The verify payload requires the original credentials — without these
      // the upstream returns 422 "username/password required".
      client.restoreCredentials(this.credentials.username, this.credentials.password);

      // One transient retry (network/5xx). A 511 means the OTP is invalid and
      // must not be retried.
      let verified = false;
      let lastError: unknown = null;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          await client.verifyOtp(otpCode);
          verified = true;
          lastError = null;
          break;
        } catch (error) {
          lastError = error;
          const status = (error as { status?: number })?.status;
          const transient = !status || status >= 500;
          if (!transient || attempt === 1) break;
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }
      if (!verified) throw lastError ?? new Error('OTP verification failed');

      await this.syncStatus.step(runId, 'login_success', 'Login successful', 35);

      // Atomically consume the window. If a newer Refresh superseded it while
      // the upstream call was in flight, abort without saving the session.
      if (activeWindow) {
        const consumed = await this.otpWindows.consume(activeWindow.id);
        if (!consumed) {
          await this.syncStatus.fail(runId, tenantId, {
            step: 'verifying_otp',
            code: 'OTP_SUPERSEDED',
            message: 'A newer OTP request superseded this one during verification',
          });
          return { status: 'superseded' as const, error: 'OTP_SUPERSEDED' };
        }

        await this.prisma.otpRequest.updateMany({
          where: {
            tenantId,
            otpWindowId: activeWindow.id,
            status: 'pending',
          },
          data: { status: 'responded', respondedAt: new Date() },
        });
      }

      if (legacyOtpId) {
        await this.prisma.otpRequest.update({
          where: { id: legacyOtpId },
          data: { status: 'responded', respondedAt: new Date() },
        });
      }

      await this.prisma.upstreamSession.update({
        where: { id: pending.id },
        data: {
          status: 'active',
          cookieEnc: this.sessionEnvelope(client),
          lastVerifiedAt: new Date(),
        },
      });

      const report = await this.scrapeAll(
        tenantId,
        client,
        {
          clients: true,
          packages: true,
          areas: true,
          loginHistory: false,
        },
        runId,
      );
      await this.markUpdated(tenantId, report);
      await this.persistJob(tenantId, report);

      if (report.errors.length > 0) {
        await this.syncStatus.fail(runId, tenantId, {
          step: 'uploading',
          code: 'SCRAPE_PARTIAL',
          message: 'Some data could not be synced',
          detail: report.errors,
        });
      } else {
        await this.syncStatus.finish(runId, tenantId, report);
      }

      await this.prisma.automationJob
        .create({
          data: {
            tenantId,
            type: 'upstream_otp_login',
            status: report.errors.length ? 'failed' : 'completed',
            payload: JSON.stringify({ at: new Date().toISOString(), report }),
            finishedAt: new Date(),
          },
        })
        .catch(() => undefined);

      return { status: 'completed' as const, report };
    } catch (error) {
      const message = (error as Error).message;
      const status = (error as { status?: number })?.status ?? null;
      const upstreamBody = (error as { body?: unknown })?.body ?? null;
      const mapped = this.mapError(error, 'verifying_otp');

      if (mapped.code === 'UPSTREAM_LOCKED') {
        await this.syncStatus.lockPanel(tenantId, 24);
      }

      if (activeWindow) {
        if (
          mapped.code === 'HTTP_511' ||
          mapped.code === 'OTP_422' ||
          mapped.code === 'UPSTREAM_LOCKED'
        ) {
          await this.otpWindows.fail(activeWindow.id, mapped.message);
        } else {
          // Transient failure: return the window to pending so a retry (or a
          // second SMS) can still use it until the 5-minute window expires.
          const released = await this.otpWindows.release(activeWindow.id);
          if (!released) {
            await this.otpWindows.fail(activeWindow.id, mapped.message);
          }
        }
      }

      await this.syncStatus.fail(runId, tenantId, mapped);

      // Persist the failure — including the upstream validation body — so the
      // exact reason is visible without server logs.
      await this.prisma.automationJob
        .create({
          data: {
            tenantId,
            type: 'upstream_otp_login',
            status: 'failed',
            lastError: message,
            payload: JSON.stringify({
              at: new Date().toISOString(),
              error: message,
              status,
              body: upstreamBody,
              code: mapped.code,
            }),
            finishedAt: new Date(),
          },
        })
        .catch(() => undefined);

      this.logger.warn(`completeLoginAndSync failed: ${message}`);
      return { status: 'failed' as const, error: message, code: mapped.code };
    } finally {
      this.busy.delete(tenantId);
    }
  }

  /** Scrapes packages, areas, clients (+ optional login history). */
  private async scrapeAll(
    tenantId: string,
    client: TriangleClient,
    scope: { clients: boolean; packages: boolean; areas: boolean; loginHistory: boolean },
    runId?: string | null,
  ): Promise<SyncReport> {
    const report: SyncReport = {
      status: 'completed',
      lastUpdatedAt: null,
      packages: { fetched: 0, created: 0, updated: 0 },
      areas: { fetched: 0, created: 0, updated: 0 },
      clients: { fetched: 0, created: 0, updated: 0 },
      loginHistory: { fetched: 0, created: 0 },
      errors: [],
    };

    if (runId) {
      await this.syncStatus.step(
        runId,
        'scraping',
        'Scraping data from upstream...',
        40,
      );
    }

    if (scope.packages) {
      try {
        const { rows: list } = extractList(await client.getSetupPackages());
        report.packages.fetched = list.length;
        for (const item of list) {
          const name = str(item.package_name ?? item.name ?? item.title);
          if (!name) continue;
          const upstreamId = str(item.id ?? item.uid);
          const price = toPaisa(
            item.r_triangle_price ??
              item.package_base_price ??
              item.price ??
              item.monthly_price ??
              item.amount ??
              item.rate,
          );
          const speed =
            Number(item.bandwidth ?? item.speed ?? item.speed_mbps) || null;

          const existing = await this.prisma.package.findFirst({
            where: { tenantId, name },
            select: { id: true },
          });

          if (existing) {
            await this.prisma.package.update({
              where: { id: existing.id },
              data: {
                ...(upstreamId ? { upstreamId } : {}),
                ...(price !== null ? { upstreamPrice: price } : {}),
                ...(speed !== null ? { speedMbps: speed } : {}),
              },
            });
            report.packages.updated += 1;
          } else {
            await this.prisma.package.create({
              data: {
                tenantId,
                name,
                upstreamId: upstreamId || null,
                upstreamPrice: price ?? 0n,
                speedMbps: speed ?? undefined,
              },
            });
            report.packages.created += 1;
          }
        }
      } catch (error) {
        const message = (error as Error).message;
        report.errors.push(`packages: ${message}`);
        await this.syncStatus.recordError(tenantId, runId ?? null, {
          step: 'scraping',
          code: 'PACKAGES_SYNC',
          message,
        });
      }
    }

    if (scope.areas) {
      try {
        const rows: Array<Record<string, unknown>> = [];
        let page = 1;
        let lastPage = 1;
        do {
          const { rows: batch, lastPage: lp } = extractList(
            await client.getSetupAreas({ page, per_page: 100 }),
          );
          rows.push(...batch);
          lastPage = lp;
          page += 1;
        } while (page <= Math.min(lastPage, 100));

        report.areas.fetched = rows.length;
        for (const item of rows) {
          const name = str(item.area_name ?? item.name ?? item.title);
          if (!name) continue;
          const upstreamId = str(item.id ?? item.uid);
          const district = str(item.district_name ?? item.district);
          const thana = str(item.upazila_name ?? item.thana_name ?? item.thana ?? item.thane);

          const existing = await this.prisma.area.findFirst({
            where: { tenantId, name },
            select: { id: true },
          });
          if (existing) {
            await this.prisma.area.update({
              where: { id: existing.id },
              data: {
                upstreamId: upstreamId || undefined,
                district: district || undefined,
                thana: thana || undefined,
              },
            });
            report.areas.updated += 1;
          } else {
            await this.prisma.area.create({
              data: {
                tenantId,
                name,
                upstreamId: upstreamId || null,
                district: district || null,
                thana: thana || null,
              },
            });
            report.areas.created += 1;
          }
        }
      } catch (error) {
        const message = (error as Error).message;
        report.errors.push(`areas: ${message}`);
        await this.syncStatus.recordError(tenantId, runId ?? null, {
          step: 'scraping',
          code: 'AREAS_SYNC',
          message,
        });
      }
    }

    if (runId) {
      await this.syncStatus.step(
        runId,
        'uploading',
        'Uploading data to software...',
        70,
      );
    }

    if (scope.clients) {
      try {
        let page = 1;
        let lastPage = 1;
        let fetched = 0;

        do {
          const { rows: list, lastPage: lp } = extractList(
            await client.getClients({ page, per_page: 100 }),
          );
          lastPage = lp;
          fetched += list.length;

          for (const item of list) {
            const upstreamId = str(item.id ?? item.uid ?? item.client_id);
            // Panel UUID is required by the recharge API (POST /clients/recharge/{uuid}).
            const upstreamUuid = str(item.uuid) || null;
            const name =
              str(item.contact_name ?? item.PPPOE_username ?? item.name ?? item.username) ||
              'Unknown';
            const mobile = str(
              item.client_mobile ?? item.mobile ?? item.phone ?? item.phone_number,
            );
            const pppoe = str(
              item.PPPOE_username ?? item.pppoe_username ?? item.username ?? item.pppoe,
            );
            const ipAddress = str(item.ip ?? item.ip_address ?? item.client_ip);
            const areaName = str(item.area_name ?? item.area);
            const packageName = str(item.package_name ?? item.package ?? item.plan);

            const rawStatus = Number(item.client_status ?? 0);
            const mappedStatus =
              rawStatus === 1
                ? 'active'
                : rawStatus === 2
                  ? 'inactive'
                  : rawStatus > 2
                    ? 'expired'
                    : null;

            const expireRaw = str(item.expire_date ?? item.expiry_date);
            const expireAt =
              expireRaw && !Number.isNaN(new Date(expireRaw).getTime())
                ? new Date(expireRaw)
                : null;

            const area = areaName
              ? await this.prisma.area.findFirst({
                  where: { tenantId, name: areaName },
                  select: { id: true },
                })
              : null;
            const pkg = packageName
              ? await this.prisma.package.findFirst({
                  where: { tenantId, name: packageName },
                  select: { id: true },
                })
              : null;

            const existing = await this.prisma.client.findFirst({
              where: {
                tenantId,
                OR: [
                  { upstreamId: upstreamId || '__none__' },
                  { mobile: mobile || '__none__' },
                ],
              },
              select: { id: true, upstreamId: true },
            });

            if (existing) {
              await this.prisma.client.update({
                where: { id: existing.id },
                data: {
                  name,
                  ...(mobile ? { mobile } : {}),
                  upstreamId: upstreamId || existing.upstreamId,
                  ...(upstreamUuid ? { upstreamUuid } : {}),
                  ...(pppoe ? { pppoeUsername: pppoe } : {}),
                  ...(ipAddress ? { ipAddress } : {}),
                  ...(area ? { areaId: area.id } : {}),
                  ...(mappedStatus ? { status: mappedStatus } : {}),
                },
              });

              if (pkg) {
                const subscription = await this.prisma.subscription.findFirst({
                  where: { clientId: existing.id, status: 'active' },
                  select: { id: true },
                });
                if (subscription) {
                  if (expireAt) {
                    await this.prisma.subscription.update({
                      where: { id: subscription.id },
                      data: { expireAt },
                    });
                  }
                } else {
                  await this.prisma.subscription.create({
                    data: {
                      clientId: existing.id,
                      packageId: pkg.id,
                      startAt: new Date(),
                      expireAt,
                      status: 'active',
                    },
                  });
                }
              }

              report.clients.updated += 1;
            } else {
              const paymentCode = await this.generatePaymentCode(tenantId);
              const created = await this.prisma.client.create({
                data: {
                  tenantId,
                  publicId: `TRG-SYNC-${Date.now()}-${Math.floor(Math.random() * 9999)}`,
                  paymentCode,
                  upstreamId: upstreamId || null,
                  upstreamUuid,
                  name,
                  mobile: mobile || '01---------',
                  areaId: area?.id ?? null,
                  pppoeUsername: pppoe || null,
                  ipAddress: ipAddress || null,
                  status: mappedStatus ?? 'active',
                },
                select: { id: true },
              });

              await this.prisma.upstreamEntityMap.upsert({
                where: {
                  tenantId_entityType_upstreamId: {
                    tenantId,
                    entityType: 'client',
                    upstreamId: upstreamId || created.id,
                  },
                },
                update: { localId: created.id },
                create: {
                  tenantId,
                  entityType: 'client',
                  upstreamId: upstreamId || created.id,
                  localId: created.id,
                },
              });

              if (pkg) {
                await this.prisma.subscription.create({
                  data: {
                    clientId: created.id,
                    packageId: pkg.id,
                    startAt: new Date(),
                    expireAt,
                    status: 'active',
                  },
                });
              }

              report.clients.created += 1;
            }

            if (scope.loginHistory && upstreamId) {
              try {
                const history = asList(await client.getLoginHistory(upstreamId));
                report.loginHistory.fetched += history.length;
                const local = await this.prisma.client.findFirst({
                  where: { tenantId, upstreamId },
                  select: { id: true },
                });
                if (local) {
                  for (const entry of history) {
                    const loginAt = new Date(
                      str(entry.login_at ?? entry.timestamp ?? entry.time) || Date.now(),
                    );
                    if (!Number.isNaN(loginAt.getTime())) {
                      await this.prisma.loginHistory
                        .create({
                          data: {
                            tenantId,
                            clientId: local.id,
                            upstreamId,
                            loginAt,
                            ip: str(entry.ip) || null,
                          },
                        })
                        .catch(() => undefined);
                      report.loginHistory.created += 1;
                    }
                  }
                }
              } catch {
                // Login history is optional; ignore per-client failures.
              }
            }
          }

          page += 1;
        } while (page <= Math.min(lastPage, 100));

        report.clients.fetched = fetched;
      } catch (error) {
        const message = (error as Error).message;
        report.errors.push(`clients: ${message}`);
        await this.syncStatus.recordError(tenantId, runId ?? null, {
          step: 'uploading',
          code: 'CLIENTS_SYNC',
          message,
        });
      }
    }

    return report;
  }

  /**
   * Processes queued recharge jobs by calling the verified panel endpoint:
   *   POST /api/v1/clients/recharge/{uuid}  body: { days, comment }
   * The panel calculates the amount itself — we only send the day count.
   */
  async processRechargeJobs(tenantId: string): Promise<{
    processed: number;
    succeeded: number;
    failed: number;
    errors: string[];
  }> {
    const result = { processed: 0, succeeded: 0, failed: 0, errors: [] as string[] };
    const { username, password } = this.credentials;
    if (!username || !password) {
      result.errors.push('TRIANGLE credentials not configured');
      return result;
    }

    const jobs = await this.prisma.rechargeJob.findMany({
      where: { tenantId, status: 'queued' },
      orderBy: { createdAt: 'asc' },
      take: 20,
      select: {
        id: true,
        clientId: true,
        durationDays: true,
        amount: true,
        idempotencyKey: true,
        client: { select: { upstreamUuid: true, upstreamId: true } },
      },
    });

    if (!jobs.length) return result;

    const client = this.newClient();
    // Try to reuse a stored active session (avoids a fresh OTP when possible).
    const active = await this.prisma.upstreamSession.findFirst({
      where: { tenantId, status: 'active' },
      orderBy: { createdAt: 'desc' },
    });
    if (active?.cookieEnc) {
      const envelope = this.parseSessionEnvelope(active.cookieEnc);
      client.restoreSession(envelope.cookies);
      client.restoreOtpChallenge(envelope.challengeToken, envelope.browserToken);
      client.restoreAuthTokens(envelope.accessToken, envelope.refreshToken);
      client.restoreCredentials(username, password);
      try {
        await client.getDashboard();
      } catch {
        // Session unusable — will need OTP; jobs stay queued.
        result.errors.push('SESSION_EXPIRED — refresh via OTP before recharge');
        return result;
      }
    } else {
      result.errors.push('NO_ACTIVE_SESSION — refresh via OTP before recharge');
      return result;
    }

    for (const job of jobs) {
      result.processed += 1;
      const uuid = job.client?.upstreamUuid;
      const days = job.durationDays;
      if (!uuid || !days) {
        await this.prisma.rechargeJob.update({
          where: { id: job.id },
          data: { status: 'failed', attempts: { increment: 1 }, lastError: 'Missing uuid or durationDays' },
        });
        result.failed += 1;
        result.errors.push(`${job.id}: missing uuid/durationDays`);
        continue;
      }
      try {
        const response = (await client.recharge(uuid, days, `job:${job.idempotencyKey}`)) as
          | { success?: boolean; message?: string }
          | string;
        const ok =
          typeof response === 'object' && response !== null
            ? response.success !== false
            : true;
        if (!ok) throw new Error((response as { message?: string })?.message ?? 'recharge rejected');

        await this.prisma.rechargeJob.update({
          where: { id: job.id },
          data: {
            status: 'completed',
            attempts: { increment: 1 },
            upstreamRef:
              typeof response === 'object' && response !== null
                ? String((response as { message?: string }).message ?? 'recharge completed')
                : 'recharge completed',
          },
        });
        result.succeeded += 1;
      } catch (error) {
        const message = (error as Error).message;
        const transient =
          error instanceof SessionExpiredError ||
          (error as { name?: string })?.name === 'AbortError' ||
          (!('status' in (error as object)) && !message.includes('insufficient'));
        await this.prisma.rechargeJob.update({
          where: { id: job.id },
          data: {
            status: transient ? 'queued' : 'failed',
            attempts: { increment: 1 },
            lastError: message,
          },
        });
        result.failed += 1;
        result.errors.push(`${job.id}: ${message}`);
      }
    }
    return result;
  }

  /** Records the last successful sync time for status display. */
  private async markUpdated(tenantId: string, report: SyncReport) {
    const now = new Date().toISOString();
    report.lastUpdatedAt = now;
    await this.prisma.setting
      .upsert({
        where: { tenantId_key: { tenantId, key: 'upstream_last_sync_at' } },
        update: { value: now },
        create: { tenantId, key: 'upstream_last_sync_at', value: now },
      })
      .catch(() => undefined);
  }

  private async generatePaymentCode(tenantId: string): Promise<string> {
    for (let attempt = 0; attempt < 50; attempt += 1) {
      const code = String(1000 + Math.floor(Math.random() * 9000));
      const existing = await this.prisma.client.findUnique({
        where: { tenantId_paymentCode: { tenantId, paymentCode: code } },
        select: { id: true },
      });
      if (!existing) return code;
    }
    throw new BadRequestException('Could not allocate a payment code');
  }

  private async persistJob(tenantId: string, report: SyncReport) {
    await this.prisma.automationJob
      .create({
        data: {
          tenantId,
          type: 'upstream_sync',
          status: report.errors.length ? 'failed' : 'completed',
          payload: JSON.stringify(report),
          finishedAt: new Date(),
        },
      })
      .catch((error) => this.logger.warn(`Failed to store sync job: ${error.message}`));
  }

  private async startAutoSyncIfEnabled() {
    const enabled = this.config.get<string>('UPSTREAM_AUTO_SYNC') === 'true';
    if (!enabled) return;
    if (this.autoTimer) return;

    const rawInterval = Number(this.config.get<string>('UPSTREAM_AUTO_SYNC_INTERVAL_MINUTES'));
    // Default: 4 times a day (every 6 hours). Override with the env var.
    const intervalMinutes = Number.isFinite(rawInterval) && rawInterval >= 1 ? rawInterval : 360;

    this.logger.log(`Upstream auto sync enabled — every ${intervalMinutes} minute(s)`);

    this.autoTimer = setInterval(async () => {
      const tenants = await this.prisma.tenant.findMany({
        where: { status: 'active' },
        select: { id: true },
      });
      for (const tenant of tenants) {
        try {
          const report = await this.sync(tenant.id, {}, { trigger: 'auto' });
          if (report.status === 'completed') {
            await this.processRechargeJobs(tenant.id).catch((error) =>
              this.logger.warn(`Auto recharge failed for ${tenant.id}: ${(error as Error).message}`),
            );
          }
        } catch (error) {
          this.logger.warn(`Auto sync failed for ${tenant.id}: ${(error as Error).message}`);
        }
      }
    }, intervalMinutes * 60 * 1000);

    this.autoTimer.unref();
  }

  /**
   * Runs upstream sync at fixed wall-clock times (e.g. 08:00 and 20:00).
   * Configure with UPSTREAM_SYNC_TIMES="08:00,20:00". Times are interpreted in
   * the process local timezone; if UPSTREAM_SYNC_TZ is set it is used for the
   * comparison via Intl. Each time slot runs at most once per calendar day.
   * This does not replace the interval-based scheduler above — both can run.
   */
  private startScheduledTimesSync() {
    const raw = this.config.get<string>('UPSTREAM_SYNC_TIMES') || '';
    const times = raw
      .split(',')
      .map((value) => value.trim())
      .filter((value) => /^([01]\d|2[0-3]):[0-5]\d$/.test(value));

    if (!times.length) return;
    if (this.scheduledTimer) return;

    const timeZone = this.config.get<string>('UPSTREAM_SYNC_TZ') || undefined;
    const pad = (value: number) => String(value).padStart(2, '0');
    const slotKey = (dateKey: string, time: string) => `${dateKey}@${time}`;

    this.logger.log(`Upstream scheduled sync enabled — ${times.join(', ')} (${timeZone ?? 'local time'})`);

    this.scheduledTimer = setInterval(async () => {
      try {
        const now = new Date();
        const parts = new Intl.DateTimeFormat('en-GB', {
          timeZone,
          hour: '2-digit',
          minute: '2-digit',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hourCycle: 'h23',
        }).formatToParts(now);
        const part = (type: string) => parts.find((item) => item.type === type)?.value ?? '';
        const hhmm = `${part('hour')}:${part('minute')}`;
        const dateKey = `${part('year')}-${part('month')}-${part('day')}`;

        for (const time of times) {
          if (hhmm !== time) continue;
          const key = slotKey(dateKey, time);
          if (this.scheduledRunDates.get(time) === key) continue;
          this.scheduledRunDates.set(time, key);

          const tenants = await this.prisma.tenant.findMany({
            where: { status: 'active' },
            select: { id: true },
          });
          for (const tenant of tenants) {
            try {
              const report = await this.sync(tenant.id, {}, { trigger: 'auto' });
              this.logger.log(
                `Scheduled sync ${time} for ${tenant.id}: ${report.status} (clients ${report.clients.fetched} fetched)`,
              );
              // After a successful scrape, run any queued recharge jobs using
              // the session we just established (OTP already handled above).
              if (report.status === 'completed') {
                try {
                  const recharge = await this.processRechargeJobs(tenant.id);
                  this.logger.log(
                    `Scheduled recharge jobs for ${tenant.id}: ${recharge.succeeded}/${recharge.processed} succeeded`,
                  );
                } catch (error) {
                  this.logger.warn(
                    `Scheduled recharge failed for ${tenant.id}: ${(error as Error).message}`,
                  );
                }
              }
            } catch (error) {
              this.logger.warn(`Scheduled sync failed for ${tenant.id}: ${(error as Error).message}`);
            }
          }
        }
      } catch (error) {
        this.logger.warn(`Scheduled sync tick failed: ${(error as Error).message}`);
      }
    }, 60_000);

    this.scheduledTimer.unref();
  }
}
