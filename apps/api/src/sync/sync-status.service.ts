import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export type SyncStep =
  | 'queued'
  | 'sending_otp'
  | 'waiting_otp'
  | 'verifying_otp'
  | 'login_success'
  | 'scraping'
  | 'uploading'
  | 'finished'
  | 'failed';

const STALE_RUN_MS = 10 * 60 * 1000;
const OTP_WAIT_MS = 4 * 60 * 1000;
const RETENTION_DAYS = 90;
const LOCK_KEY = 'upstream_lock_until';

@Injectable()
export class SyncStatusService implements OnModuleInit {
  private readonly logger = new Logger('SyncStatus');
  private readonly active = new Map<string, string>();

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    this.cleanup().catch((error) =>
      this.logger.warn(`Sync log cleanup failed: ${error.message}`),
    );
    const timer = setInterval(
      () => this.cleanup().catch(() => undefined),
      24 * 60 * 60 * 1000,
    );
    timer.unref();
  }

  /** Creates a run, or returns the already-running one (per-tenant lock). */
  async start(
    tenantId: string,
    trigger: 'manual' | 'auto' | 'otp',
    triggeredBy?: string | null,
  ) {
    // Mark hung runs as failed so the tenant is never blocked forever.
    await this.prisma.syncRun
      .updateMany({
        where: {
          tenantId,
          status: 'running',
          startedAt: { lt: new Date(Date.now() - STALE_RUN_MS) },
        },
        data: {
          status: 'failed',
          currentStep: 'failed',
          lastError: 'Sync timed out after 10 minutes',
          finishedAt: new Date(),
        },
      })
      .catch(() => undefined);

    const running = await this.prisma.syncRun.findFirst({
      where: { tenantId, status: 'running' },
      orderBy: { startedAt: 'desc' },
    });
    if (running) return { run: running, busy: true };

    const run = await this.prisma.syncRun.create({
      data: {
        tenantId,
        trigger,
        triggeredBy: triggeredBy ?? null,
        status: 'running',
        currentStep: 'queued',
        stepMessage: 'Starting sync',
      },
    });
    this.active.set(tenantId, run.id);
    return { run, busy: false };
  }

  async findRunning(tenantId: string) {
    return this.prisma.syncRun.findFirst({
      where: { tenantId, status: 'running' },
      orderBy: { startedAt: 'desc' },
    });
  }

  async step(
    runId: string,
    step: SyncStep,
    message: string,
    progress?: number,
  ) {
    await this.prisma.syncRun
      .update({
        where: { id: runId },
        data: {
          currentStep: step,
          stepMessage: message,
          ...(progress !== undefined ? { progress } : {}),
        },
      })
      .catch(() => undefined);
  }

  async finish(runId: string, tenantId: string, stats: unknown) {
    await this.prisma.syncRun
      .update({
        where: { id: runId },
        data: {
          status: 'completed',
          currentStep: 'finished',
          stepMessage: 'Finished',
          progress: 100,
          finishedAt: new Date(),
          stats: JSON.stringify(stats),
        },
      })
      .catch(() => undefined);
    this.active.delete(tenantId);
  }

  /** Records an error without failing the whole run (partial sync). */
  async recordError(
    tenantId: string,
    runId: string | null,
    input: {
      step: string;
      code: string;
      message: string;
      detail?: unknown;
      httpStatus?: number | null;
    },
  ) {
    const detail =
      input.detail === undefined || input.detail === null
        ? null
        : typeof input.detail === 'string'
          ? input.detail
          : JSON.stringify(input.detail);
    await this.prisma.syncError
      .create({
        data: {
          tenantId,
          runId: runId ?? null,
          step: input.step,
          code: input.code,
          message: input.message,
          detail,
          httpStatus: input.httpStatus ?? null,
        },
      })
      .catch(() => undefined);
  }

  async fail(
    runId: string | null,
    tenantId: string,
    input: {
      step: string;
      code: string;
      message: string;
      detail?: unknown;
      httpStatus?: number | null;
    },
  ) {
    const detail =
      input.detail === undefined || input.detail === null
        ? null
        : typeof input.detail === 'string'
          ? input.detail
          : JSON.stringify(input.detail);

    await this.prisma.syncError
      .create({
        data: {
          tenantId,
          runId: runId ?? null,
          step: input.step,
          code: input.code,
          message: input.message,
          detail,
          httpStatus: input.httpStatus ?? null,
        },
      })
      .catch(() => undefined);

    if (runId) {
      await this.prisma.syncRun
        .update({
          where: { id: runId },
          data: {
            status: 'failed',
            currentStep: 'failed',
            stepMessage: input.message,
            lastError: `${input.code}: ${input.message}`,
            finishedAt: new Date(),
          },
        })
        .catch(() => undefined);
      this.active.delete(tenantId);
    }
  }

  async lockPanel(tenantId: string, hours = 24) {
    const until = new Date(Date.now() + hours * 60 * 60 * 1000);
    await this.prisma.setting.upsert({
      where: { tenantId_key: { tenantId, key: LOCK_KEY } },
      update: { value: until.toISOString() },
      create: { tenantId, key: LOCK_KEY, value: until.toISOString() },
    });
    return until;
  }

  async lockedUntil(tenantId: string): Promise<string | null> {
    const row = await this.prisma.setting.findUnique({
      where: { tenantId_key: { tenantId, key: LOCK_KEY } },
    });
    if (!row?.value) return null;
    const until = new Date(row.value);
    if (Number.isNaN(until.getTime()) || until.getTime() <= Date.now()) return null;
    return until.toISOString();
  }

  async status(tenantId: string) {
    // Never leave the UI stuck: expire runs that have been waiting for an OTP
    // or running for too long, and record the reason.
    await this.expireStuck(tenantId);

    const [run, errorCount, lockUntil, lastSms] = await Promise.all([
      this.prisma.syncRun.findFirst({
        where: { tenantId },
        orderBy: { startedAt: 'desc' },
      }),
      this.prisma.syncError.count({ where: { tenantId, resolvedAt: null } }),
      this.lockedUntil(tenantId),
      this.prisma.webhookAttempt.findFirst({
        where: { success: true },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      }),
    ]);

    return {
      run: run
        ? {
            ...run,
            stats: run.stats ? JSON.parse(run.stats) : null,
          }
        : null,
      errorCount,
      lockUntil,
      lastSmsAt: lastSms?.createdAt ?? null,
    };
  }

  private async expireStuck(tenantId: string) {
    const waiting = await this.prisma.syncRun.findFirst({
      where: {
        tenantId,
        status: 'running',
        currentStep: { in: ['sending_otp', 'waiting_otp'] },
        startedAt: { lt: new Date(Date.now() - OTP_WAIT_MS) },
      },
      orderBy: { startedAt: 'asc' },
    });
    if (waiting) {
      await this.fail(waiting.id, tenantId, {
        step: 'waiting_otp',
        code: 'OTP_TIMEOUT',
        message: 'OTP SMS did not reach the server within 4 minutes',
        detail:
          'No webhook request was received from the phone. Check that MacroDroid is enabled, battery optimization is off, auto-start is allowed, and the SMS trigger uses Any Number / Any content.',
      });
    }

    const stale = await this.prisma.syncRun.findFirst({
      where: {
        tenantId,
        status: 'running',
        startedAt: { lt: new Date(Date.now() - STALE_RUN_MS) },
      },
      orderBy: { startedAt: 'asc' },
    });
    if (stale) {
      await this.fail(stale.id, tenantId, {
        step: 'sync',
        code: 'SYNC_STALE',
        message: 'Sync timed out after 10 minutes',
      });
    }
  }

  async errors(
    tenantId: string,
    query: { page?: number; limit?: number; code?: string } = {},
  ) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where = {
      tenantId,
      ...(query.code ? { code: query.code } : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.syncError.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.syncError.count({ where }),
    ]);
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async errorById(tenantId: string, id: string) {
    return this.prisma.syncError.findFirst({ where: { tenantId, id } });
  }

  private async cleanup() {
    await this.prisma.syncError.deleteMany({
      where: {
        createdAt: {
          lt: new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000),
        },
      },
    });
  }
}
