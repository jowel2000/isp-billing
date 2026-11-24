import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export const OTP_WINDOW_MS = 5 * 60 * 1000;
const VERIFY_LEASE_MS = 2 * 60 * 1000;
const MAX_ATTEMPTS = 3;

export interface StartOtpWindowInput {
  trigger: 'manual' | 'auto';
  userId?: string | null;
  sessionId?: string | null;
  deviceId?: string | null;
}

/**
 * Owns the single active OTP window per tenant.
 *
 * Lifecycle:
 *   pending -> verifying -> consumed
 *   pending -> expired
 *   pending/verifying -> superseded (newer Refresh/auto-send)
 *   verifying -> failed (invalid OTP / exhausted retries)
 *
 * The server is the source of truth. The phone only forwards SMS with its
 * timestamp; it never decides whether an OTP is still valid.
 */
@Injectable()
export class OtpWindowService {
  private readonly logger = new Logger('OtpWindow');

  constructor(private readonly prisma: PrismaService) {}

  /** Creates a new 5-minute window and supersedes any older active window. */
  async start(
    tenantId: string,
    input: StartOtpWindowInput,
    requestedAtInput?: Date,
  ) {
    const requestedAt = requestedAtInput ?? new Date();
    const expiresAt = new Date(requestedAt.getTime() + OTP_WINDOW_MS);

    const window = await this.prisma.$transaction(async (tx) => {
      // Serialize Refresh vs Refresh / Refresh vs SMS for this tenant.
      await tx.$queryRaw`SELECT id FROM "Tenant" WHERE id = ${tenantId} FOR UPDATE`;

      await tx.otpWindow.updateMany({
        where: { tenantId, status: { in: ['pending', 'verifying'] } },
        data: {
          status: 'superseded',
          lastError: 'Superseded by a newer OTP request',
          verifyingUntil: null,
        },
      });

      return tx.otpWindow.create({
        data: {
          tenantId,
          trigger: input.trigger,
          requestedBy: input.userId ?? null,
          sessionId: input.sessionId ?? null,
          deviceId: input.deviceId ?? null,
          requestedAt,
          expiresAt,
        },
      });
    });

    this.logger.log(
      `OTP window started for ${tenantId}: ${window.id} (expires ${expiresAt.toISOString()})`,
    );
    return window;
  }

  /** The active (pending) window, if any. */
  async active(tenantId: string) {
    return this.prisma.otpWindow.findFirst({
      where: { tenantId, status: 'pending' },
      orderBy: { requestedAt: 'desc' },
    });
  }

  async byId(tenantId: string, id: string) {
    return this.prisma.otpWindow.findFirst({ where: { id, tenantId } });
  }

  /**
   * Atomically moves pending -> verifying. Only one SMS can claim the window.
   * Returns false when another SMS/newer Refresh already claimed/superseded it.
   */
  async claim(windowId: string) {
    const result = await this.prisma.otpWindow.updateMany({
      where: { id: windowId, status: 'pending' },
      data: {
        status: 'verifying',
        attempts: { increment: 1 },
        verifyingUntil: new Date(Date.now() + VERIFY_LEASE_MS),
      },
    });
    return result.count > 0;
  }

  /** Atomically moves verifying -> consumed. */
  async consume(windowId: string) {
    const result = await this.prisma.otpWindow.updateMany({
      where: { id: windowId, status: 'verifying' },
      data: {
        status: 'consumed',
        consumedAt: new Date(),
        verifyingUntil: null,
      },
    });
    return result.count > 0;
  }

  async fail(windowId: string, error: string) {
    await this.prisma.otpWindow.updateMany({
      where: { id: windowId, status: { in: ['pending', 'verifying'] } },
      data: { status: 'failed', lastError: error, verifyingUntil: null },
    });
  }

  async expire(windowId: string, error = 'OTP window expired') {
    await this.prisma.otpWindow.updateMany({
      where: { id: windowId, status: { in: ['pending', 'verifying'] } },
      data: { status: 'expired', lastError: error, verifyingUntil: null },
    });
  }

  /** Returns a transient-failure window to pending when retries remain. */
  async release(windowId: string) {
    const result = await this.prisma.otpWindow.updateMany({
      where: {
        id: windowId,
        status: 'verifying',
        expiresAt: { gt: new Date() },
        attempts: { lt: MAX_ATTEMPTS },
      },
      data: { status: 'pending', verifyingUntil: null },
    });
    return result.count > 0;
  }

  /** Marks any active window as superseded (e.g. session was reused). */
  async supersede(tenantId: string, reason: string) {
    await this.prisma.otpWindow.updateMany({
      where: { tenantId, status: { in: ['pending', 'verifying'] } },
      data: { status: 'superseded', lastError: reason, verifyingUntil: null },
    });
  }

  /**
   * Housekeeping so the UI never shows an active window forever:
   * - pending past expiry -> expired
   * - verifying past expiry -> expired
   * - verifying whose worker lease expired -> pending (retryable)
   */
  async recoverStale(tenantId: string) {
    const now = new Date();

    await this.prisma.otpWindow.updateMany({
      where: { tenantId, status: 'pending', expiresAt: { lt: now } },
      data: {
        status: 'expired',
        lastError: 'OTP window expired',
        verifyingUntil: null,
      },
    });

    await this.prisma.otpWindow.updateMany({
      where: { tenantId, status: 'verifying', expiresAt: { lt: now } },
      data: {
        status: 'expired',
        lastError: 'OTP window expired during verification',
        verifyingUntil: null,
      },
    });

    await this.prisma.otpWindow.updateMany({
      where: {
        tenantId,
        status: 'verifying',
        verifyingUntil: { lt: now },
      },
      data: { status: 'pending', verifyingUntil: null },
    });
  }

  /** Compact window shape for `/sync/status` and diagnostics. */
  async describe(tenantId: string) {
    const window = await this.prisma.otpWindow.findFirst({
      where: { tenantId, status: { in: ['pending', 'verifying'] } },
      orderBy: { requestedAt: 'desc' },
    });
    if (!window) return null;

    return {
      id: window.id,
      status: window.status,
      trigger: window.trigger,
      requestedAt: window.requestedAt,
      expiresAt: window.expiresAt,
      secondsRemaining: Math.max(
        0,
        Math.ceil((window.expiresAt.getTime() - Date.now()) / 1000),
      ),
    };
  }
}
