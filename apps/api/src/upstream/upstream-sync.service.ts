import {
  BadRequestException,
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TriangleClient } from '@isp/adapter-triangle';
import { decryptString, encryptString } from '../common/crypto';
import { PrismaService } from '../prisma/prisma.service';

interface SyncReport {
  status: 'completed' | 'otp_required' | 'failed';
  lastUpdatedAt: string | null;
  packages: { fetched: number; created: number; updated: number };
  areas: { fetched: number; created: number; updated: number };
  clients: { fetched: number; created: number; updated: number };
  loginHistory: { fetched: number; created: number };
  errors: string[];
  note?: string;
}

const LOGIN_COOLDOWN_MS = 10 * 60 * 1000;
const PENDING_OTP_TTL_MS = 5 * 60 * 1000;

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
  private readonly busy = new Set<string>();

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  onModuleInit() {
    this.startAutoSyncIfEnabled();
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

  private async saveActiveSession(tenantId: string, client: TriangleClient) {
    const cookies = encryptString(JSON.stringify(client.sessionCookies()));
    await this.prisma.upstreamSession.create({
      data: {
        tenantId,
        cookieEnc: cookies,
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
  ): Promise<'ok' | 'otp_required'> {
    // 1. Reuse the last active session.
    const active = await this.prisma.upstreamSession.findFirst({
      where: { tenantId, status: 'active' },
      orderBy: { createdAt: 'desc' },
    });
    if (active?.cookieEnc) {
      try {
        client.restoreSession(JSON.parse(decryptString(active.cookieEnc)));
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
      return 'otp_required';
    }

    // 3. Cooldown: never attempt a fresh login more often than every 10 min.
    const lastAttempt = await this.lastLoginAttemptAt(tenantId);
    if (lastAttempt && Date.now() - lastAttempt < LOGIN_COOLDOWN_MS) {
      return 'otp_required';
    }

    // 4. Fresh login attempt (this triggers ONE OTP SMS from Triangle).
    const { username, password } = this.credentials;
    const login = await client.login(username, password);
    await this.rememberLoginAttempt(tenantId);

    if (login.otpRequired) {
      await this.prisma.upstreamSession.create({
        data: {
          tenantId,
          cookieEnc: encryptString(JSON.stringify(client.sessionCookies())),
          status: 'pending_otp',
        },
      });
      return 'otp_required';
    }

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
  ): Promise<SyncReport> {
    const { username, password } = this.credentials;
    if (!username || !password) {
      throw new BadRequestException(
        'TRIANGLE_USERNAME / TRIANGLE_PASSWORD are not configured — set them in the environment',
      );
    }

    const empty = (): SyncReport => ({
      status: 'completed',
      lastUpdatedAt: null,
      packages: { fetched: 0, created: 0, updated: 0 },
      areas: { fetched: 0, created: 0, updated: 0 },
      clients: { fetched: 0, created: 0, updated: 0 },
      loginHistory: { fetched: 0, created: 0 },
      errors: [],
    });

    const client = this.newClient();
    const state = await this.ensureSession(tenantId, client);

    if (state !== 'ok') {
      const report = empty();
      report.status = 'otp_required';
      report.note =
        'OTP requested — when the forwarded SMS arrives the sync completes automatically. New logins are rate-limited to avoid SMS spam.';
      return report;
    }

    const doScope = {
      clients: scope.clients ?? true,
      packages: scope.packages ?? true,
      areas: scope.areas ?? true,
      loginHistory: scope.loginHistory ?? false,
    };

    const report = await this.scrapeAll(tenantId, client, doScope);
    await this.markUpdated(tenantId, report);
    await this.persistJob(tenantId, report);
    return report;
  }

  /**
   * Called when a forwarded SMS contains an OTP: verifies it with Triangle,
   * saves the session and immediately scrapes + updates all data.
   */
  async completeLoginAndSync(tenantId: string) {
    if (this.busy.has(tenantId)) return { status: 'busy' as const };
    this.busy.add(tenantId);
    try {
      const pending = await this.prisma.upstreamSession.findFirst({
        where: { tenantId, status: 'pending_otp' },
        orderBy: { createdAt: 'desc' },
      });
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

      if (!pending?.cookieEnc || !otpRow?.codeEnc) {
        return { status: 'nothing_to_do' as const };
      }

      // Single-use: consume the OTP before verifying.
      await this.prisma.otpRequest.update({
        where: { id: otpRow.id },
        data: { status: 'responded', respondedAt: new Date() },
      });

      const client = this.newClient();
      client.restoreSession(JSON.parse(decryptString(pending.cookieEnc)));
      await client.verifyOtp(decryptString(otpRow.codeEnc));

      await this.prisma.upstreamSession.update({
        where: { id: pending.id },
        data: {
          status: 'active',
          cookieEnc: encryptString(JSON.stringify(client.sessionCookies())),
          lastVerifiedAt: new Date(),
        },
      });

      const report = await this.scrapeAll(tenantId, client, {
        clients: true,
        packages: true,
        areas: true,
        loginHistory: false,
      });
      await this.markUpdated(tenantId, report);
      await this.persistJob(tenantId, report);
      return { status: 'completed' as const, report };
    } catch (error) {
      this.logger.warn(`completeLoginAndSync failed: ${(error as Error).message}`);
      return { status: 'failed' as const, error: (error as Error).message };
    } finally {
      this.busy.delete(tenantId);
    }
  }

  /** Scrapes packages, areas, clients (+ optional login history). */
  private async scrapeAll(
    tenantId: string,
    client: TriangleClient,
    scope: { clients: boolean; packages: boolean; areas: boolean; loginHistory: boolean },
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

    if (scope.packages) {
      try {
        const list = asList(await client.getPackages());
        report.packages.fetched = list.length;
        for (const item of list) {
          const name = str(item.name ?? item.package_name ?? item.title);
          if (!name) continue;
          const upstreamId = str(item.id ?? item.uid);
          const price = toPaisa(item.price ?? item.monthly_price ?? item.amount ?? item.rate);
          const speed = Number(item.speed ?? item.speed_mbps ?? item.bandwidth) || null;

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
        report.errors.push(`packages: ${(error as Error).message}`);
      }
    }

    if (scope.areas) {
      try {
        const list = asList(await client.getAreas());
        report.areas.fetched = list.length;
        for (const item of list) {
          const name = str(item.name ?? item.area_name ?? item.title);
          if (!name) continue;
          const existing = await this.prisma.area.findFirst({
            where: { tenantId, name },
            select: { id: true },
          });
          if (existing) {
            await this.prisma.area.update({
              where: { id: existing.id },
              data: {
                upstreamId: str(item.id ?? item.uid) || undefined,
                district: str(item.district) || undefined,
                thana: str(item.thana ?? item.thane) || undefined,
              },
            });
            report.areas.updated += 1;
          } else {
            await this.prisma.area.create({
              data: {
                tenantId,
                name,
                upstreamId: str(item.id ?? item.uid) || null,
                district: str(item.district) || null,
                thana: str(item.thana ?? item.thane) || null,
              },
            });
            report.areas.created += 1;
          }
        }
      } catch (error) {
        report.errors.push(`areas: ${(error as Error).message}`);
      }
    }

    if (scope.clients) {
      try {
        const list = asList(await client.getClients());
        report.clients.fetched = list.length;

        for (const item of list) {
          const upstreamId = str(item.id ?? item.uid ?? item.client_id);
          const name = str(item.name ?? item.full_name ?? item.username) || 'Unknown';
          const mobile = str(item.mobile ?? item.phone ?? item.phone_number);
          const pppoe = str(item.pppoe_username ?? item.username ?? item.pppoe);
          const ipAddress = str(item.ip ?? item.ip_address);
          const areaName = str(item.area ?? item.area_name);
          const packageName = str(item.package ?? item.package_name ?? item.plan);

          const area = areaName
            ? await this.prisma.area.findFirst({ where: { tenantId, name: areaName }, select: { id: true } })
            : null;
          const pkg = packageName
            ? await this.prisma.package.findFirst({ where: { tenantId, name: packageName }, select: { id: true } })
            : null;

          const existing = await this.prisma.client.findFirst({
            where: { tenantId, OR: [{ upstreamId: upstreamId || '__none__' }, { mobile: mobile || '__none__' }] },
            select: { id: true, upstreamId: true },
          });

          if (existing) {
            await this.prisma.client.update({
              where: { id: existing.id },
              data: {
                name,
                ...(mobile ? { mobile } : {}),
                upstreamId: upstreamId || existing.upstreamId,
                ...(pppoe ? { pppoeUsername: pppoe } : {}),
                ...(ipAddress ? { ipAddress } : {}),
                ...(area ? { areaId: area.id } : {}),
              },
            });
            report.clients.updated += 1;
          } else {
            const paymentCode = await this.generatePaymentCode(tenantId);
            const created = await this.prisma.client.create({
              data: {
                tenantId,
                publicId: `TRG-SYNC-${Date.now()}-${Math.floor(Math.random() * 9999)}`,
                paymentCode,
                upstreamId: upstreamId || null,
                name,
                mobile: mobile || '01---------',
                areaId: area?.id ?? null,
                pppoeUsername: pppoe || null,
                ipAddress: ipAddress || null,
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
      } catch (error) {
        report.errors.push(`clients: ${(error as Error).message}`);
      }
    }

    return report;
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

  private async generatePaymentCode(tenantId: string): Promise<string> {    for (let attempt = 0; attempt < 50; attempt += 1) {
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
          await this.sync(tenant.id);
        } catch (error) {
          this.logger.warn(`Auto sync failed for ${tenant.id}: ${(error as Error).message}`);
        }
      }
    }, intervalMinutes * 60 * 1000);

    this.autoTimer.unref();
  }
}
