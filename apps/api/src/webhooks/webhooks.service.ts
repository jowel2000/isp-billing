import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, createHmac } from 'node:crypto';
import { Prisma } from '@prisma/client';
import type { AuthUser } from '../auth/types/auth-user';
import { encryptString } from '../common/crypto';
import { OtpStore } from '../upstream/otp.store';
import { OtpWindowService } from '../upstream/otp-window.service';
import { UpstreamSyncService } from '../upstream/upstream-sync.service';
import { PaymentsService } from '../payments/payments.service';
import { PrismaService } from '../prisma/prisma.service';
import { SmsWebhookDto } from './dto/sms-webhook.dto';
import {
  SmsAiClassification,
  SmsAiClassifierService,
} from './sms-ai-classifier.service';
import { ParsedSms, SmsParserService } from './sms-parser.service';

const CLOCK_SKEW_TOLERANCE_MS = 90_000;

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function bucket30s(date: Date): string {
  return new Date(Math.floor(date.getTime() / 30_000) * 30_000).toISOString();
}

/**
 * Accepts ISO-8601 (with Z/offset) or MacroDroid's local
 * "yyyy-MM-dd HH:mm:ss" (Asia/Dhaka, UTC+6, no DST).
 */
function parseDeviceTimestamp(value?: string): Date | null {
  if (!value) return null;
  const raw = value.trim();

  if (/[zZ]$|[+-]\d{2}:?\d{2}$/.test(raw)) {
    const date = new Date(raw);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const local = raw.match(
    /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/,
  );
  if (local) {
    const [, y, mo, d, h, mi, s] = local;
    return new Date(
      Date.UTC(
        Number(y),
        Number(mo) - 1,
        Number(d),
        Number(h) - 6,
        Number(mi),
        Number(s ?? '0'),
      ),
    );
  }

  const fallback = new Date(raw);
  return Number.isNaN(fallback.getTime()) ? null : fallback;
}

/**
 * Device time is used only when the phone clock is plausible; otherwise the
 * server receipt time is authoritative (phone clocks/timezones are unreliable).
 */
function resolveReceivedAt(server: Date, device: Date | null) {
  if (!device) return { at: server, skewMs: 0, source: 'server' as const };

  const skewMs = device.getTime() - server.getTime();
  if (Math.abs(skewMs) > CLOCK_SKEW_TOLERANCE_MS) {
    return { at: server, skewMs, source: 'server' as const };
  }
  return { at: device, skewMs, source: 'device' as const };
}

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger('Webhooks');

  constructor(
    private readonly prisma: PrismaService,
    private readonly parser: SmsParserService,
    private readonly aiClassifier: SmsAiClassifierService,
    private readonly otpStore: OtpStore,
    private readonly otpWindows: OtpWindowService,
    private readonly payments: PaymentsService,
    private readonly upstreamSync: UpstreamSyncService,
  ) {}

  assertSecret(secret: string | undefined) {
    const expected = process.env.SMS_FORWARD_SECRET;
    if (!expected || secret !== expected) {
      throw new UnauthorizedException('Invalid SMS forward secret');
    }
  }

  /**
   * Logs every webhook attempt — successful and failed — so the phone → server
   * link can be diagnosed. The secret itself is never stored; only its
   * SHA-256 hash (to tell "wrong secret" from "no secret").
   */
  async logAttempt(input: {
    ip?: string | null;
    secretHash?: string | null;
    bodyHash?: string | null;
    bodySnippet?: string | null;
    statusCode: number;
    success: boolean;
    reason?: string | null;
  }) {
    await this.prisma.webhookAttempt
      .create({ data: input })
      .catch(() => undefined);
  }

  async ingest(dto: SmsWebhookDto) {
    // Single-tenant deployment. A device-token mapping can select the tenant later.
    const tenant = await this.prisma.tenant.findFirst({ orderBy: { createdAt: 'asc' } });
    if (!tenant) return { accepted: false, reason: 'no_tenant' };

    const body = String(
      dto.message ?? dto.message_body ?? dto.body ?? dto.text ?? '',
    ).trim();
    const sender = (dto.sender ?? dto.from)?.trim() || null;
    if (!body) return { accepted: false, reason: 'empty_message' };

    const serverReceivedAt = new Date();
    const deviceReceivedAt = parseDeviceTimestamp(
      dto.smsReceivedAt ?? dto.received_at ?? dto.receivedAt,
    );
    const { at: receivedAt, skewMs } = resolveReceivedAt(
      serverReceivedAt,
      deviceReceivedAt,
    );

    // The signature contract hashes the RAW fields exactly as the phone sent
    // them (empty string when omitted), so the client can reproduce the hash.
    const rawSender = dto.sender ?? dto.from ?? '';
    const rawBody = dto.message ?? dto.message_body ?? dto.body ?? dto.text ?? '';
    const rawReceivedAt =
      dto.smsReceivedAt ?? dto.received_at ?? dto.receivedAt ?? '';
    const bodyHash = sha256(`${rawSender}|${rawBody}|${rawReceivedAt}`);
    const idempotencyKey =
      dto.idempotencyKey?.trim() ||
      sha256(
        `${dto.deviceId ?? ''}|${rawSender}|${
          rawReceivedAt || bucket30s(serverReceivedAt)
        }|${rawBody}`,
      );

    // Replay protection: a nonce may only be used once per tenant.
    if (dto.nonce) {
      const reused = await this.prisma.smsInbound.findUnique({
        where: { tenantId_nonce: { tenantId: tenant.id, nonce: dto.nonce } },
      });
      if (reused) {
        return { accepted: false, duplicate: true, reason: 'nonce-replay' };
      }
    }

    // Signature authentication (HMAC-SHA256 over timestamp.nonce.bodyHash).
    if (dto.signature || dto.timestamp) {
      if (!dto.signature || !dto.timestamp || !dto.nonce) {
        throw new UnauthorizedException('Signature requires timestamp and nonce');
      }
      const ts = Number(dto.timestamp);
      if (!Number.isFinite(ts) || Math.abs(Date.now() - ts) > 5 * 60 * 1000) {
        throw new UnauthorizedException('Timestamp is outside the allowed window');
      }
      const expected = createHmac('sha256', process.env.SMS_FORWARD_SECRET || '')
        .update(`${dto.timestamp}.${dto.nonce}.${bodyHash}`)
        .digest('hex');
      if (dto.signature.toLowerCase() !== expected.toLowerCase()) {
        throw new UnauthorizedException('Invalid SMS signature');
      }
    }

    // Idempotency: the same forwarded SMS is accepted once.
    const duplicate = await this.prisma.smsInbound.findUnique({
      where: { tenantId_idempotencyKey: { tenantId: tenant.id, idempotencyKey } },
    });
    if (duplicate) {
      return {
        accepted: true,
        duplicate: true,
        smsId: duplicate.id,
        status: duplicate.status,
        reason: duplicate.rejectionReason ?? undefined,
      };
    }

    // Expire stale windows before deciding whether an OTP is acceptable.
    await this.otpWindows.recoverStale(tenant.id);

    const latestWindow = await this.prisma.otpWindow.findFirst({
      where: { tenantId: tenant.id },
      orderBy: { requestedAt: 'desc' },
    });
    const activeWindow = latestWindow?.status === 'pending' ? latestWindow : null;

    // AI is an optional first pass. If it is disabled, times out, or returns
    // an invalid/low-confidence OTP, the deterministic parser below still runs.
    const ai = await this.aiClassifier.classify({ sender, body });
    let parsed = this.parser.parse(body, sender, Boolean(activeWindow));

    if (ai && !ai.error) {
      if (ai.category === 'UPSTREAM_OTP' && ai.isOtp && ai.otp) {
        parsed = {
          ...parsed,
          kind: 'otp',
          provider: 'triangle',
          otpCode: ai.otp,
          otpLike: true,
          otpReason: undefined,
          otpCandidates: undefined,
        };
      } else if (
        ai.category === 'BKASH' ||
        ai.category === 'NAGAD' ||
        ai.category === 'ROCKET'
      ) {
        const provider = ai.category.toLowerCase();
        if (parsed.kind === 'otp') {
          // An MFS OTP must never complete an upstream login.
          parsed = {
            ...parsed,
            kind: 'unknown',
            provider,
            otpCode: null,
            otpLike: false,
            otpReason: undefined,
            otpCandidates: undefined,
          };
        } else if (!parsed.provider) {
          parsed = { ...parsed, provider };
        }
      }
    }

    if (parsed.blocked) {
      const record = await this.storeSms({
        tenantId: tenant.id,
        sender,
        body,
        bodyHash,
        idempotencyKey,
        nonce: dto.nonce ?? null,
        kind: 'unknown',
        provider: null,
        amountPaisa: null,
        trxId: null,
        referenceCode: null,
        senderMobile: null,
        otpCode: null,
        status: 'ignored',
        error: `Blocked: ${parsed.blocked}`,
        receivedAt,
        smsReceivedAt: deviceReceivedAt,
        serverReceivedAt,
        clockSkewMs: Math.round(skewMs),
        otpWindowId: null,
      }, ai);
      return {
        accepted: true,
        ignored: true,
        reason: parsed.blocked,
        smsId: record?.id ?? undefined,
      };
    }

    if (parsed.otpLike) {
      return this.handleOtpMessage(tenant.id, dto, {
        body,
        sender,
        bodyHash,
        idempotencyKey,
        serverReceivedAt,
        deviceReceivedAt,
        receivedAt,
        skewMs,
        latestWindow,
        activeWindow,
        parsed,
        ai,
      });
    }

    const record = await this.storeSms({
      tenantId: tenant.id,
      sender,
      body,
      bodyHash,
      idempotencyKey,
      nonce: dto.nonce ?? null,
      kind: parsed.kind,
      provider: parsed.provider,
      amountPaisa: parsed.amountPaisa ?? null,
      trxId: parsed.trxId,
      referenceCode: parsed.referenceCode,
      senderMobile: parsed.senderMobile,
      otpCode: null,
      status: 'new',
      receivedAt,
      smsReceivedAt: deviceReceivedAt,
      serverReceivedAt,
      clockSkewMs: Math.round(skewMs),
      otpWindowId: null,
    }, ai);

    if (!record) {
      return { accepted: false, duplicate: true, reason: 'already-stored' };
    }

    if (parsed.kind !== 'payment') {
      return { accepted: true, smsId: record.id, kind: parsed.kind, status: 'unknown' };
    }

    return this.handlePayment(tenant.id, record.id, parsed);
  }

  private async handleOtpMessage(
    tenantId: string,
    dto: SmsWebhookDto,
    ctx: {
      body: string;
      sender: string | null;
      bodyHash: string;
      idempotencyKey: string;
      serverReceivedAt: Date;
      deviceReceivedAt: Date | null;
      receivedAt: Date;
      skewMs: number;
      latestWindow: {
        id: string;
        status: string;
        requestedAt: Date;
        expiresAt: Date;
      } | null;
      activeWindow: {
        id: string;
        requestedAt: Date;
        expiresAt: Date;
      } | null;
      parsed: ParsedSms;
      ai: SmsAiClassification | null;
    },
  ) {
    const {
      body,
      sender,
      bodyHash,
      idempotencyKey,
      serverReceivedAt,
      deviceReceivedAt,
      receivedAt,
      skewMs,
      latestWindow,
      activeWindow,
      parsed,
      ai,
    } = ctx;

    const reject = async (reason: string, windowId?: string | null) => {
      const record = await this.storeSms({
        tenantId,
        sender,
        body,
        bodyHash,
        idempotencyKey,
        nonce: dto.nonce ?? null,
        kind: parsed.otpCode ? 'otp' : 'unknown',
        provider: parsed.provider,
        amountPaisa: null,
        trxId: null,
        referenceCode: null,
        senderMobile: null,
        // Never persist a rejected OTP code.
        otpCode: null,
        status: 'rejected',
        rejectionReason: reason,
        receivedAt,
        smsReceivedAt: deviceReceivedAt,
        serverReceivedAt,
        clockSkewMs: Math.round(skewMs),
        otpWindowId: windowId ?? null,
      }, ai);

      if (!record) {
        const existing = await this.prisma.smsInbound.findUnique({
          where: { tenantId_idempotencyKey: { tenantId, idempotencyKey } },
        });
        return {
          accepted: false,
          duplicate: true,
          reason,
          smsId: existing?.id ?? null,
        };
      }

      return { accepted: false, reason, smsId: record.id };
    };

    if (!latestWindow) return reject('OTP_NO_WINDOW');

    if (latestWindow.status === 'superseded') {
      return reject('OTP_SUPERSEDED', latestWindow.id);
    }
    if (latestWindow.status === 'consumed') {
      return reject('OTP_ALREADY_CONSUMED', latestWindow.id);
    }
    if (latestWindow.status === 'failed') {
      return reject('OTP_WINDOW_FAILED', latestWindow.id);
    }
    if (latestWindow.status === 'expired') {
      return reject('OTP_EXPIRED', latestWindow.id);
    }

    if (!activeWindow) {
      if (latestWindow.expiresAt.getTime() <= serverReceivedAt.getTime()) {
        return reject('OTP_EXPIRED', latestWindow.id);
      }
      return reject('OTP_ALREADY_CLAIMED', latestWindow.id);
    }

    if (receivedAt.getTime() < activeWindow.requestedAt.getTime()) {
      return reject('OTP_TOO_EARLY', activeWindow.id);
    }

    if (receivedAt.getTime() >= activeWindow.expiresAt.getTime()) {
      await this.otpWindows.expire(activeWindow.id, 'OTP_EXPIRED');
      return reject('OTP_EXPIRED', activeWindow.id);
    }

    if (!parsed.otpCode) {
      return reject(parsed.otpReason ?? 'OTP_NOT_FOUND', activeWindow.id);
    }

    if (dto.otp && dto.otp.trim().toUpperCase() !== parsed.otpCode) {
      return reject('OTP_HINT_MISMATCH', activeWindow.id);
    }

    const record = await this.storeSms({
      tenantId,
      sender,
      body,
      bodyHash,
      idempotencyKey,
      nonce: dto.nonce ?? null,
      kind: 'otp',
      provider: 'triangle',
      amountPaisa: null,
      trxId: null,
      referenceCode: null,
      senderMobile: null,
      otpCode: parsed.otpCode,
      status: 'otp',
      receivedAt,
      smsReceivedAt: deviceReceivedAt,
      serverReceivedAt,
      clockSkewMs: Math.round(skewMs),
      otpWindowId: activeWindow.id,
    }, ai);

    if (!record) {
      const existing = await this.prisma.smsInbound.findUnique({
        where: { tenantId_idempotencyKey: { tenantId, idempotencyKey } },
      });
      return {
        accepted: true,
        duplicate: true,
        smsId: existing?.id ?? null,
        status: existing?.status,
      };
    }

    // Only one SMS can claim the window. A newer Refresh may have superseded
    // it between the read and this update.
    const claimed = await this.otpWindows.claim(activeWindow.id);
    if (!claimed) {
      await this.prisma.smsInbound.update({
        where: { id: record.id },
        data: { status: 'rejected', rejectionReason: 'OTP_SUPERSEDED' },
      });
      return { accepted: false, reason: 'OTP_SUPERSEDED', smsId: record.id };
    }

    // Encrypted short-lived copy for diagnostics/backward compatibility.
    await this.prisma.otpRequest.create({
      data: {
        tenantId,
        context: 'triangle_login',
        status: 'pending',
        requestedAt: activeWindow.requestedAt,
        expiresAt: activeWindow.expiresAt,
        codeHash: sha256(parsed.otpCode),
        codeEnc: encryptString(parsed.otpCode),
        otpWindowId: activeWindow.id,
      },
    });

    this.otpStore.set('default', parsed.otpCode);

    void this.upstreamSync
      .completeLoginAndSync(tenantId, activeWindow.id)
      .catch((error) =>
        this.logger.warn(`OTP login completion failed: ${error.message}`),
      );

    return {
      accepted: true,
      smsId: record.id,
      windowId: activeWindow.id,
      kind: 'otp',
      status: 'otp',
      expiresAt: activeWindow.expiresAt.toISOString(),
      receivedAt: receivedAt.toISOString(),
    };
  }

  private async storeSms(
    data: Prisma.SmsInboundUncheckedCreateInput,
    ai: SmsAiClassification | null = null,
  ) {
    const aiFields = ai
      ? {
          aiCategory: ai.error ? 'ERROR' : ai.category,
          aiConfidence: ai.confidence,
          aiProvider: ai.provider,
          aiModel: ai.model,
          aiReason: (ai.error
            ? `AI error: ${ai.error}`
            : ai.reason
          ).slice(0, 500),
        }
      : {};

    try {
      return await this.prisma.smsInbound.create({
        data: { ...data, ...aiFields },
      });
    } catch (error: any) {
      // Idempotency/nonce race: the other request already stored it.
      if (error?.code === 'P2002') return null;
      throw error;
    }
  }

  private async handlePayment(
    tenantId: string,
    smsId: string,
    parsed: ParsedSms,
  ) {
    const amountPaisa = parsed.amountPaisa ?? 0;
    if (amountPaisa <= 0 || !parsed.trxId) {
      await this.prisma.smsInbound.update({
        where: { id: smsId },
        data: { status: 'error', error: 'Could not read amount or Trx ID' },
      });
      return { accepted: true, smsId, kind: 'payment', status: 'error' };
    }

    const existing = await this.prisma.payment.findFirst({
      where: { tenantId, trxId: parsed.trxId },
      select: { id: true },
    });
    if (existing) {
      await this.prisma.smsInbound.update({
        where: { id: smsId },
        data: { status: 'ignored', paymentId: existing.id, error: 'Duplicate Trx ID' },
      });
      return { accepted: true, smsId, status: 'ignored', paymentId: existing.id };
    }

    const client = await this.resolveClient(tenantId, parsed.referenceCode);

    if (!client) {
      await this.prisma.reconciliationIssue.create({
        data: {
          tenantId,
          type: 'sms_unmatched',
          refType: 'sms_inbound',
          refId: smsId,
          details: JSON.stringify({
            amountPaisa,
            trxId: parsed.trxId,
            referenceCode: parsed.referenceCode,
            senderMobile: parsed.senderMobile,
            provider: parsed.provider,
          }),
        },
      });
      await this.prisma.smsInbound.update({
        where: { id: smsId },
        data: { status: 'unmatched', error: 'No client matched this payment' },
      });
      return { accepted: true, smsId, status: 'unmatched' };
    }

    const payment = await this.prisma.payment.create({
      data: {
        tenantId,
        clientId: client.id,
        method: parsed.provider ?? 'bkash',
        provider: parsed.provider ?? 'bkash',
        accountType: 'merchant',
        channel: 'sms',
        amount: amountPaisa,
        trxId: parsed.trxId,
        senderNumber: parsed.senderMobile,
        referenceCode: parsed.referenceCode ?? client.paymentCode ?? client.publicId,
        paidAt: new Date(),
        status: 'pending',
      },
    });

    const setting = async (key: string, fallback: string) => {
      const row = await this.prisma.setting.findUnique({
        where: { tenantId_key: { tenantId, key } },
      });
      return row?.value ?? fallback;
    };
    const autoVerify = (await setting('sms_auto_verify_enabled', 'true')) === 'true';
    const maxPaisa = Number(await setting('sms_auto_verify_max_paisa', '500000')) || 500000;

    let status = 'pending';
    let rechargeQueued = false;

    if (autoVerify && amountPaisa <= maxPaisa) {
      const actor = await this.systemActor(tenantId);
      if (actor) {
        try {
          const result = await this.payments.verify(actor, payment.id);
          status = 'verified';
          rechargeQueued = Boolean(result.rechargeJob);
        } catch (error) {
          status = 'pending';
          await this.prisma.smsInbound.update({
            where: { id: smsId },
            data: { error: (error as Error).message },
          });
        }
      }
    }

    await this.prisma.smsInbound.update({
      where: { id: smsId },
      data: { status, paymentId: payment.id },
    });

    return {
      accepted: true,
      smsId,
      status,
      paymentId: payment.id,
      clientId: client.id,
      clientName: client.name,
      amountPaisa,
      rechargeQueued,
    };
  }

  async matchSms(actor: AuthUser, smsId: string, clientId: string) {
    const sms = await this.prisma.smsInbound.findFirst({
      where: { id: smsId, tenantId: actor.tenantId },
    });
    if (!sms) throw new NotFoundException('SMS not found');
    if (sms.paymentId) {
      return { alreadyMatched: true, paymentId: sms.paymentId };
    }
    if (sms.kind !== 'payment' || !sms.amountPaisa) {
      throw new BadRequestException('This SMS is not a payment');
    }

    const client = await this.prisma.client.findFirst({
      where: { id: clientId, tenantId: actor.tenantId, status: 'active' },
    });
    if (!client) throw new NotFoundException('Client not found');

    if (sms.trxId) {
      const duplicate = await this.prisma.payment.findFirst({
        where: { tenantId: actor.tenantId, trxId: sms.trxId },
        select: { id: true },
      });
      if (duplicate) {
        await this.prisma.smsInbound.update({
          where: { id: sms.id },
          data: { status: 'ignored', paymentId: duplicate.id, error: 'Duplicate Trx ID' },
        });
        return { alreadyMatched: true, paymentId: duplicate.id };
      }
    }

    const payment = await this.prisma.payment.create({
      data: {
        tenantId: actor.tenantId,
        clientId: client.id,
        method: sms.provider ?? 'bkash',
        provider: sms.provider ?? 'bkash',
        accountType: 'merchant',
        channel: 'sms',
        amount: sms.amountPaisa,
        trxId: sms.trxId,
        senderNumber: sms.senderMobile,
        referenceCode: sms.referenceCode ?? client.paymentCode ?? client.publicId,
        paidAt: sms.receivedAt ?? new Date(),
        status: 'pending',
      },
    });

    let status = 'pending';
    let rechargeQueued = false;
    try {
      const result = await this.payments.verify(actor, payment.id);
      status = 'verified';
      rechargeQueued = Boolean(result.rechargeJob);
    } catch (error) {
      await this.prisma.smsInbound.update({
        where: { id: sms.id },
        data: { error: (error as Error).message },
      });
    }

    await this.prisma.smsInbound.update({
      where: { id: sms.id },
      data: { status, paymentId: payment.id },
    });

    await this.prisma.reconciliationIssue.updateMany({
      where: {
        tenantId: actor.tenantId,
        refType: 'sms_inbound',
        refId: sms.id,
        status: 'open',
      },
      data: { status: 'resolved', resolvedAt: new Date(), assignedTo: actor.id },
    });

    return {
      matched: true,
      smsId: sms.id,
      paymentId: payment.id,
      clientId: client.id,
      clientName: client.name,
      status,
      rechargeQueued,
    };
  }

  private async resolveClient(tenantId: string, referenceCode: string | null) {
    // Only the 4-digit reference can auto-match. Personal transfers without a
    // reference are never guessed: they must be reviewed in Wrong Recharge.
    if (!referenceCode) return null;

    return this.prisma.client.findFirst({
      where: { tenantId, paymentCode: referenceCode, status: 'active' },
    });
  }

  private async systemActor(tenantId: string): Promise<AuthUser | null> {
    const admin = await this.prisma.user.findFirst({
      where: { tenantId, status: 'active', role: { name: 'super_admin' } },
      select: { id: true, name: true, mobile: true },
    });
    if (!admin) return null;
    return {
      id: admin.id,
      tenantId,
      name: admin.name,
      mobile: admin.mobile,
      email: null,
      role: 'super_admin',
      roleLevel: 100,
      permissions: [],
      areaIds: [],
    };
  }

  async list(tenantId: string, query: { page?: number; limit?: number; status?: string; kind?: string }) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where = {
      tenantId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.kind ? { kind: query.kind } : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.smsInbound.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          payment: { select: { id: true, status: true, amount: true } },
        },
      }),
      this.prisma.smsInbound.count({ where }),
    ]);
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }
}
