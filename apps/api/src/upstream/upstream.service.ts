import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TriangleClient } from '@isp/adapter-triangle';
import { PrismaService } from '../prisma/prisma.service';

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36';

@Injectable()
export class UpstreamService {
  private readonly logger = new Logger('Upstream');

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  private settings() {
    return {
      baseUrl: (this.config.get<string>('TRIANGLE_BASE_URL') || 'https://lisp.triangle.com.bd').replace(/\/+$/, ''),
      username: this.config.get<string>('TRIANGLE_USERNAME') || '',
      password: this.config.get<string>('TRIANGLE_PASSWORD') || '',
    };
  }

  async status(tenantId: string) {
    const { baseUrl, username } = this.settings();

    const session = await this.prisma.upstreamSession.findFirst({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });

    const diagnostic = await this.prisma.setting.findUnique({
      where: { tenantId_key: { tenantId, key: 'upstream_diagnostic' } },
    });

    return {
      adapter: 'triangle',
      baseUrl,
      configured: Boolean(baseUrl && username),
      session: session
        ? {
            status: session.status,
            expiresAt: session.expiresAt,
            lastVerifiedAt: session.lastVerifiedAt,
          }
        : { status: 'not_connected' },
      lastDiagnostic: diagnostic?.value ? JSON.parse(diagnostic.value) : null,
      sync: {
        enabled: false,
        note: 'Diagnose with POST /upstream/diagnose; sync jobs run in the worker.',
      },
    };
  }

  /**
   * Runs a full upstream diagnosis and stores the result so failures are
   * never silent. Steps:
   *  1. GET /login/ (HTML) — structure, status, CAPTCHA/CSRF detection.
   *  2. POST /api/v1/login — credential check (if configured).
   */
  async diagnose(tenantId: string) {
    const { baseUrl, username, password } = this.settings();
    const steps: Array<Record<string, unknown>> = [];
    const startedAt = Date.now();

    // Step 1: login page structure
    try {
      const start = Date.now();
      const response = await fetch(`${baseUrl}/login/`, {
        redirect: 'manual',
        headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,application/xhtml+xml' },
      });
      const html = await response.text();
      const location = response.headers.get('location');

      steps.push({
        step: 'homepage',
        ok: response.status >= 200 && response.status < 400,
        status: response.status,
        timeMs: Date.now() - start,
        redirectedTo: location ?? null,
        bytes: html.length,
        hasLoginForm: /<form/i.test(html),
        hasCaptcha: /captcha|recaptcha|hcaptcha|turnstile/i.test(html),
        hasCsrfToken: /csrf|_token/i.test(html),
        hint:
          response.status === 403 || response.status === 429
            ? 'Possible IP block / rate limit'
            : html.length < 500
              ? 'Page is tiny — structure may have changed or it is a redirect/JS app'
              : 'OK',
      });
    } catch (error) {
      steps.push({
        step: 'homepage',
        ok: false,
        error: (error as Error).message,
        hint: 'Network failure, DNS, timeout or certificate problem',
      });
    }

    // Step 2: credentials / session
    if (!username || !password) {
      steps.push({
        step: 'login',
        ok: false,
        error: 'TRIANGLE_USERNAME / TRIANGLE_PASSWORD are not configured',
      });
    } else {
      try {
        const client = new TriangleClient({ baseUrl, requestsPerMinute: 5, timeoutMs: 25000 });
        const result = await client.login(username, password);
        steps.push({
          step: 'login',
          ok: true,
          otpRequired: result.otpRequired,
          hasSession: client.hasSession(),
          hint: result.otpRequired
            ? 'OTP required — forward the SMS via POST /api/v1/webhooks/sms'
            : 'Logged in',
        });
      } catch (error) {
        const err = error as Error;
        steps.push({
          step: 'login',
          ok: false,
          error: err.message,
          type: err.constructor.name,
          hint:
            err.constructor.name === 'PanelLockedError'
              ? 'Upstream panel is locked — stop retrying and wait for the cool-down'
              : err.constructor.name === 'SessionExpiredError'
                ? 'Session expired — re-login needed'
                : 'Check credentials or the panel API structure',
        });
      }
    }

    const diagnostic = {
      at: new Date().toISOString(),
      totalTimeMs: Date.now() - startedAt,
      baseUrl,
      steps,
    };

    // Persist for the status endpoint and keep an automation job trail.
    await this.prisma.setting.upsert({
      where: { tenantId_key: { tenantId, key: 'upstream_diagnostic' } },
      update: { value: JSON.stringify(diagnostic) },
      create: { tenantId, key: 'upstream_diagnostic', value: JSON.stringify(diagnostic) },
    });

    await this.prisma.automationJob
      .create({
        data: {
          tenantId,
          type: 'upstream_diagnose',
          status: steps.every((step) => step.ok) ? 'completed' : 'failed',
          payload: JSON.stringify(diagnostic),
          finishedAt: new Date(),
        },
      })
      .catch((error) => this.logger.warn(`Failed to store diagnose job: ${error.message}`));

    return diagnostic;
  }
}
