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
  packages: { fetched: number; created: number; updated: number };
  areas: { fetched: number; created: number; updated: number };
  clients: { fetched: number; created: number; updated: number };
  loginHistory: { fetched: number; created: number };
  errors: string[];
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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
  // Prices from the panel are in taka; store paisa.
  return BigInt(Math.round(number * 100));
}

@Injectable()
export class UpstreamSyncService implements OnModuleInit {
  private readonly logger = new Logger('UpstreamSync');
  private autoTimer: NodeJS.Timeout | null = null;

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

  private async isAutoSyncEnabled(): Promise<boolean> {
    return this.config.get<string>('UPSTREAM_AUTO_SYNC') === 'true';
  }

  /** Polls the DB for a forwarded Triangle OTP (single-use, 5 min TTL). */
  private async waitForOtp(tenantId: string, timeoutMs: number): Promise<string | null> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const row = await this.prisma.otpRequest.findFirst({
        where: {
          tenantId,
          context: 'triangle_login',
          status: 'pending',
          expiresAt: { gt: new Date() },
        },
        orderBy: { requestedAt: 'desc' },
        select: { id: true, codeEnc: true },
      });
      if (row?.codeEnc) {
        // Single-use: mark consumed before returning.
        await this.prisma.otpRequest.update({
          where: { id: row.id },
          data: { status: 'responded', respondedAt: new Date() },
        });
        return decryptString(row.codeEnc);
      }
      await sleep(3000);
    }
    return null;
  }

  private async ensureSession(client: TriangleClient, tenantId: string) {
    const session = await this.prisma.upstreamSession.findFirst({
      where: { tenantId, status: 'active' },
      orderBy: { createdAt: 'desc' },
    });

    if (session?.cookieEnc) {
      try {
        client.restoreSession(JSON.parse(decryptString(session.cookieEnc)));
        // Cheap check: the dashboard call throws SessionExpiredError on 401.
        await client.getDashboard();
        await this.prisma.upstreamSession.update({
          where: { id: session.id },
          data: { lastVerifiedAt: new Date() },
        });
        return true;
      } catch {
        // Session expired — fall through and log in again.
      }
    }

    const { username, password } = this.credentials;
    const login = await client.login(username, password);

    if (login.otpRequired) {
      const otp = await this.waitForOtp(tenantId, 120_000);
      if (!otp) {
        throw new BadRequestException(
          'Triangle asked for an OTP but none arrived via the SMS webhook. Forward the phone SMS and retry.',
        );
      }
      await client.verifyOtp(otp);
    }

    await this.prisma.upstreamSession.upsert({
      where: { id: session?.id ?? 'new-session' },
      update: {
        cookieEnc: encryptString(JSON.stringify(client.sessionCookies())),
        status: 'active',
        lastVerifiedAt: new Date(),
      },
      create: {
        tenantId,
        cookieEnc: encryptString(JSON.stringify(client.sessionCookies())),
        status: 'active',
        lastVerifiedAt: new Date(),
      },
    });

    return true;
  }

  /**
   * Full upstream sync: packages, areas, clients (+ client login history).
   * Uses the stored session when possible; otherwise logs in (OTP via the
   * SMS webhook) before scraping.
   */
  async sync(
    tenantId: string,
    scope: { clients?: boolean; packages?: boolean; areas?: boolean; loginHistory?: boolean } = {},
  ): Promise<SyncReport> {
    const { baseUrl, username, password } = this.credentials;
    if (!username || !password) {
      throw new BadRequestException(
        'TRIANGLE_USERNAME / TRIANGLE_PASSWORD are not configured — set them in the environment',
      );
    }

    const report: SyncReport = {
      packages: { fetched: 0, created: 0, updated: 0 },
      areas: { fetched: 0, created: 0, updated: 0 },
      clients: { fetched: 0, created: 0, updated: 0 },
      loginHistory: { fetched: 0, created: 0 },
      errors: [],
    };

    const client = new TriangleClient({
      baseUrl,
      requestsPerMinute: 15,
      timeoutMs: 25_000,
    });

    try {
      await this.ensureSession(client, tenantId);
    } catch (error) {
      report.errors.push(`login failed: ${(error as Error).message}`);
      await this.persistJob(tenantId, report);
      return report;
    }

    const doScope = {
      clients: scope.clients ?? true,
      packages: scope.packages ?? true,
      areas: scope.areas ?? true,
      loginHistory: scope.loginHistory ?? false,
    };

    if (doScope.packages) {
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

    if (doScope.areas) {
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

    if (doScope.clients) {
      try {
        const list = asList(await client.getClients());
        report.clients.fetched = list.length;

        const tenant = await this.prisma.tenant.findFirst({
          where: { id: tenantId },
          select: { code: true },
        });

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

          if (doScope.loginHistory && upstreamId) {
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

    await this.persistJob(tenantId, report);
    return report;
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
    const enabled = await this.isAutoSyncEnabled();
    if (!enabled) return;
    if (this.autoTimer) return;

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
    }, 30 * 60 * 1000);

    this.autoTimer.unref();
  }
}
