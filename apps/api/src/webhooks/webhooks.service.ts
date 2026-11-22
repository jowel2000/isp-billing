import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, createHmac } from 'node:crypto';
import type { AuthUser } from '../auth/types/auth-user';
import { encryptString } from '../common/crypto';
import { OtpStore } from '../upstream/otp.store';
import { PaymentsService } from '../payments/payments.service';
import { PrismaService } from '../prisma/prisma.service';
import { SmsWebhookDto } from './dto/sms-webhook.dto';
import { ParsedSms, SmsParserService } from './sms-parser.service';

@Injectable()
export class WebhooksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly parser: SmsParserService,
    private readonly otpStore: OtpStore,
    private readonly payments: PaymentsService,
  ) {}

  assertSecret(secret: string | undefined) {
    const expected = process.env.SMS_FORWARD_SECRET;
    if (!expected || secret !== expected) {
      throw new UnauthorizedException('Invalid SMS forward secret');
    }
  }

  async ingest(dto: SmsWebhookDto) {
    // Single-tenant deployment. A device-token mapping can select the tenant later.
    const tenant = await this.prisma.tenant.findFirst({ orderBy: { createdAt: 'asc' } });
    if (!tenant) return { accepted: false, reason: 'no_tenant' };

    const body = String(dto.message ?? dto.body ?? dto.text ?? '').trim();
    const sender = (dto.sender ?? dto.from)?.trim() || null;
    if (!body) return { accepted: false, reason: 'empty_message' };

    const receivedAt = dto.receivedAt ? new Date(dto.receivedAt) : null;
    // The signature contract hashes the RAW fields exactly as the phone sent
    // them (empty string when omitted), so the client can reproduce the hash.
    const rawSender = dto.sender ?? dto.from ?? '';
    const rawBody = dto.message ?? dto.body ?? dto.text ?? '';
    const rawReceivedAt = dto.receivedAt ?? '';
    const bodyHash = createHash('sha256')
      .update(`${rawSender}|${rawBody}|${rawReceivedAt}`)
      .digest('hex');

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

    const duplicate = await this.prisma.smsInbound.findUnique({
      where: { tenantId_bodyHash: { tenantId: tenant.id, bodyHash } },
    });
    if (duplicate) {
      return {
        accepted: true,
        duplicate: true,
        smsId: duplicate.id,
        status: duplicate.status,
      };
    }

    const parsed = this.parser.parse(body, sender);
    let record;
    try {
      record = await this.prisma.smsInbound.create({
        data: {
          tenantId: tenant.id,
          sender,
          body,
          bodyHash,
          nonce: dto.nonce ?? null,
          kind: parsed.kind,
          provider: parsed.provider,
          amountPaisa: parsed.amountPaisa ?? null,
          trxId: parsed.trxId,
          referenceCode: parsed.referenceCode,
          senderMobile: parsed.senderMobile,
          otpCode: parsed.otpCode,
          receivedAt,
        },
      });
    } catch (error: any) {
      if (error?.code === 'P2002') {
        return { accepted: false, duplicate: true, reason: 'already-stored' };
      }
      throw error;
    }

    if (parsed.kind === 'otp' && parsed.otpCode) {
      // Keep it in memory for the in-process worker AND persist an encrypted,
      // short-lived copy in the DB so it survives restarts.
      this.otpStore.set('default', parsed.otpCode);
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
      await this.prisma.otpRequest.create({
        data: {
          tenantId: tenant.id,
          context: 'triangle_login',
          codeHash: createHash('sha256').update(parsed.otpCode).digest('hex'),
          codeEnc: encryptString(parsed.otpCode),
          expiresAt,
        },
      });

      await this.prisma.smsInbound.update({
        where: { id: record.id },
        data: { status: 'otp' },
      });
      return {
        accepted: true,
        smsId: record.id,
        kind: 'otp',
        status: 'otp',
        expiresAt: expiresAt.toISOString(),
      };
    }

    if (parsed.kind !== 'payment') {
      return { accepted: true, smsId: record.id, kind: parsed.kind, status: 'unknown' };
    }

    return this.handlePayment(tenant.id, record.id, parsed);
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
