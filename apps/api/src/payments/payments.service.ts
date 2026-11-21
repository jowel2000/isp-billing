import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@isp/db';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthUser } from '../auth/types/auth-user';
import { InvoicesService } from '../billing/invoices.service';
import {
  CreatePaymentDto,
  ListPaymentsDto,
  MatchPaymentDto,
  PortalPaymentDto,
} from './dto/payment.dto';

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly invoicesService: InvoicesService,
  ) {}

  async list(actor: AuthUser, query: ListPaymentsDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const where: Prisma.PaymentWhereInput = {
      tenantId: actor.tenantId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.method ? { method: query.method } : {}),
      ...(query.clientId ? { clientId: query.clientId } : {}),
      ...(query.search
        ? {
            OR: [
              { trxId: { contains: query.search } },
              { senderNumber: { contains: query.search } },
              { referenceCode: { contains: query.search } },
              { client: { name: { contains: query.search } } },
              { client: { publicId: { contains: query.search } } },
            ],
          }
        : {}),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.payment.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          client: { select: { id: true, name: true, publicId: true, mobile: true } },
          invoice: { select: { id: true, number: true, total: true, dueAmount: true } },
        },
      }),
      this.prisma.payment.count({ where }),
    ]);

    return { data: rows, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async create(actor: AuthUser, dto: CreatePaymentDto) {
    const client = await this.prisma.client.findFirst({
      where: { id: dto.clientId, tenantId: actor.tenantId },
    });
    if (!client) throw new NotFoundException('Client not found');

    if (dto.invoiceId) {
      await this.assertInvoice(actor.tenantId, client.id, dto.invoiceId);
    }

    try {
      const payment = await this.prisma.payment.create({
        data: {
          tenantId: actor.tenantId,
          clientId: client.id,
          invoiceId: dto.invoiceId,
          method: dto.method,
          provider: dto.provider ?? (dto.method === 'cash' ? 'cash' : 'bkash'),
          accountType: dto.accountType ?? 'manual',
          channel: 'manual',
          amount: dto.amountPaisa,
          trxId: dto.trxId || null,
          senderNumber: dto.senderNumber,
          referenceCode: dto.referenceCode ?? client.paymentCode ?? client.publicId,
          paidAt: dto.paidAt ? new Date(dto.paidAt) : new Date(),
          status: 'pending',
        },
      });

      await this.audit(actor, 'payment.create', payment.id, {
        clientId: client.id,
        method: dto.method,
        amount: dto.amountPaisa,
      });
      return payment;
    } catch (error) {
      if (isUniqueError(error)) {
        throw new ConflictException('This Trx ID has already been submitted');
      }
      throw error;
    }
  }

  async verify(actor: AuthUser, id: string) {
    const payment = await this.prisma.payment.findFirst({
      where: { id, tenantId: actor.tenantId },
      include: {
        client: {
          include: {
            billingProfile: true,
            subscriptions: {
              where: { status: 'active' },
              orderBy: { createdAt: 'desc' },
              take: 1,
              include: { package: true },
            },
          },
        },
        invoice: true,
      },
    });
    if (!payment) throw new NotFoundException('Payment not found');
    if (!['pending', 'unmatched'].includes(payment.status)) {
      throw new BadRequestException(`Payment is already ${payment.status}`);
    }

    const verifiedAt = new Date();
    const updated = await this.prisma.payment.update({
      where: { id },
      data: {
        status: 'verified',
        verifiedBy: actor.id,
        verifiedAt,
      },
    });

    let invoice: any = null;
    if (payment.invoiceId) {
      invoice = await this.invoicesService.applyPayment(
        payment.invoiceId,
        Number(payment.amount),
      );
    }

    await this.postLedger(
      actor.tenantId,
      payment.id,
      '1000',
      '4000',
      Number(payment.amount),
      'payment',
      payment.id,
      payment.clientId,
    );

    const packageInfo = payment.client.subscriptions[0]?.package;
    const monthlyBill = Number(
      payment.client.billingProfile?.monthlyAmountOverride ??
        packageInfo?.localPrice ??
        0,
    );
    const dailyRate = monthlyBill > 0 ? Math.ceil(monthlyBill / 30) : 0;
    const days =
      dailyRate > 0 ? Math.ceil(Number(payment.amount) / dailyRate) : null;
    const upstreamCost =
      packageInfo && days
        ? Math.ceil((Number(packageInfo.upstreamPrice) / 30) * days)
        : 0;

    let rechargeJob: any = null;
    const autoRecharge = await this.isAutoRechargeEnabled(actor.tenantId);
    if (days) {
      const shouldAuto = autoRecharge && payment.client.billingProfile?.autoRecharge;
      rechargeJob = await this.prisma.rechargeJob.upsert({
        where: { idempotencyKey: `recharge:${payment.id}` },
        update: {},
        create: {
          tenantId: actor.tenantId,
          clientId: payment.clientId,
          invoiceId: payment.invoiceId,
          paymentId: payment.id,
          packageId: packageInfo?.id,
          amount: payment.amount,
          durationDays: days,
          upstreamCostPaisa: upstreamCost,
          status: shouldAuto ? 'queued' : 'needs_manual',
          idempotencyKey: `recharge:${payment.id}`,
        },
      });
    }

    await this.audit(actor, 'payment.verify', id, {
      amount: Number(payment.amount),
      rechargeQueued: Boolean(rechargeJob),
      rechargeDays: days,
    });

    return { payment: updated, invoice, rechargeJob };
  }

  async reject(actor: AuthUser, id: string, reason: string) {
    const payment = await this.prisma.payment.findFirst({
      where: { id, tenantId: actor.tenantId },
    });
    if (!payment) throw new NotFoundException('Payment not found');
    if (payment.status !== 'pending') {
      throw new BadRequestException(`Payment is already ${payment.status}`);
    }

    const updated = await this.prisma.payment.update({
      where: { id },
      data: { status: 'rejected', rejectReason: reason, verifiedBy: actor.id },
    });

    await this.audit(actor, 'payment.reject', id, { reason });
    return updated;
  }

  async unmatched(actor: AuthUser) {
    return this.prisma.payment.findMany({
      where: {
        tenantId: actor.tenantId,
        OR: [
          { status: 'unmatched' },
          { status: 'pending', invoiceId: null },
        ],
      },
      orderBy: { createdAt: 'desc' },
      include: {
        client: { select: { id: true, name: true, publicId: true, mobile: true } },
      },
      take: 100,
    });
  }

  async match(actor: AuthUser, id: string, dto: MatchPaymentDto) {
    const payment = await this.prisma.payment.findFirst({
      where: { id, tenantId: actor.tenantId },
    });
    if (!payment) throw new NotFoundException('Payment not found');

    const clientId = dto.clientId ?? payment.clientId;
    if (dto.invoiceId) {
      await this.assertInvoice(actor.tenantId, clientId, dto.invoiceId);
    }

    const updated = await this.prisma.payment.update({
      where: { id },
      data: {
        clientId,
        invoiceId: dto.invoiceId ?? null,
      },
    });

    await this.audit(actor, 'payment.match', id, {
      clientId,
      invoiceId: dto.invoiceId ?? null,
    });
    return updated;
  }

  async refund(actor: AuthUser, id: string) {
    const payment = await this.prisma.payment.findFirst({
      where: { id, tenantId: actor.tenantId },
    });
    if (!payment) throw new NotFoundException('Payment not found');
    if (payment.status !== 'verified') {
      throw new BadRequestException('Only verified payments can be refunded');
    }

    const updated = await this.prisma.payment.update({
      where: { id },
      data: { status: 'refunded', verifiedBy: actor.id },
    });

    await this.postLedger(
      actor.tenantId,
      `refund:${payment.id}`,
      '4000',
      '1000',
      Number(payment.amount),
      'refund',
      payment.id,
      payment.clientId,
    );

    if (payment.invoiceId) {
      const invoice = await this.prisma.invoice.findUnique({
        where: { id: payment.invoiceId },
      });
      if (invoice) {
        const paidAmount =
          invoice.paidAmount > payment.amount ? invoice.paidAmount - payment.amount : 0n;
        const dueAmount = invoice.total > paidAmount ? invoice.total - paidAmount : 0n;
        await this.prisma.invoice.update({
          where: { id: invoice.id },
          data: {
            paidAmount,
            dueAmount,
            status: dueAmount === 0n ? 'paid' : paidAmount > 0n ? 'partial' : 'due',
          },
        });
      }
    }

    await this.audit(actor, 'payment.refund', id, { amount: Number(payment.amount) });
    return updated;
  }

  async portalSubmit(actor: AuthUser, dto: PortalPaymentDto) {
    const client = await this.findPortalClient(actor);
    if (!client) throw new NotFoundException('No client profile linked to this account');

    let invoiceId = dto.invoiceId;
    let amountPaisa = dto.amountPaisa;

    if (invoiceId) {
      const invoice = await this.assertInvoice(actor.tenantId, client.id, invoiceId);
      amountPaisa = amountPaisa ?? Number(invoice.dueAmount);
      if (!amountPaisa || amountPaisa <= 0) {
        throw new BadRequestException('This invoice has no due amount');
      }
    }

    if (!amountPaisa || amountPaisa <= 0) {
      throw new BadRequestException('amountPaisa is required');
    }

    const provider = dto.provider ?? 'bkash';
    const accountType = dto.accountType ?? 'merchant';
    const gateway = await this.prisma.paymentGateway.findFirst({
      where: { tenantId: actor.tenantId, type: provider, isActive: true },
    });
    if (!gateway) {
      throw new BadRequestException(`${provider} payments are not enabled`);
    }

    const receiverNumber =
      accountType === 'merchant' ? gateway.merchantNumber : gateway.personalNumber;
    const accountActive =
      accountType === 'merchant' ? gateway.merchantActive : gateway.personalActive;
    if (!accountActive || !receiverNumber) {
      throw new BadRequestException(`${accountType} account is not active`);
    }

    const providedReference = dto.referenceCode?.trim() || client.paymentCode || '';
    const referenceMatches =
      !client.paymentCode || providedReference === client.paymentCode;

    const existingPending = await this.prisma.payment.findFirst({
      where: {
        tenantId: actor.tenantId,
        clientId: client.id,
        invoiceId: invoiceId ?? null,
        status: 'pending',
        channel: 'manual',
      },
    });
    if (existingPending) {
      throw new BadRequestException('এই invoice-এ একটি পেমেন্ট already review-এ আছে');
    }

    try {
      const payment = await this.prisma.payment.create({
        data: {
          tenantId: actor.tenantId,
          clientId: client.id,
          invoiceId,
          method: provider,
          provider,
          accountType,
          receiverNumber,
          channel: 'manual',
          amount: amountPaisa,
          trxId: dto.trxId || null,
          senderNumber: dto.senderNumber,
          referenceCode: providedReference,
          paidAt: dto.paidAt ? new Date(dto.paidAt) : new Date(),
          status: referenceMatches ? 'pending' : 'unmatched',
        },
      });

      await this.audit(actor, 'payment.submit', payment.id, {
        clientId: client.id,
        amount: amountPaisa,
      });
      return payment;
    } catch (error) {
      if (isUniqueError(error)) {
        throw new ConflictException('This Trx ID has already been submitted');
      }
      throw error;
    }
  }

  async portalSummary(actor: AuthUser) {
    const client = await this.findPortalClient(actor);
    if (!client) throw new NotFoundException('No client profile linked to this account');

    const [invoiceAgg, invoices, payments] = await this.prisma.$transaction([
      this.prisma.invoice.aggregate({
        where: { tenantId: actor.tenantId, clientId: client.id, dueAmount: { gt: 0 } },
        _sum: { dueAmount: true },
      }),
      this.prisma.invoice.findMany({
        where: { tenantId: actor.tenantId, clientId: client.id },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
      this.prisma.payment.findMany({
        where: { tenantId: actor.tenantId, clientId: client.id },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
    ]);

    const { nidNumberEnc, pppoePasswordEnc, ...safeClient } = client as any;
    return {
      client: safeClient,
      totalDuePaisa: Number(invoiceAgg._sum.dueAmount ?? 0),
      recentInvoices: invoices,
      recentPayments: payments,
    };
  }

  async portalInvoices(actor: AuthUser) {
    const client = await this.findPortalClient(actor);
    if (!client) throw new NotFoundException('No client profile linked to this account');
    return this.prisma.invoice.findMany({
      where: { tenantId: actor.tenantId, clientId: client.id },
      orderBy: { createdAt: 'desc' },
      include: { items: true },
    });
  }

  async portalPayments(actor: AuthUser) {
    const client = await this.findPortalClient(actor);
    if (!client) throw new NotFoundException('No client profile linked to this account');
    return this.prisma.payment.findMany({
      where: { tenantId: actor.tenantId, clientId: client.id },
      orderBy: { createdAt: 'desc' },
    });
  }

  async portalPaymentMethods(tenantId: string) {
    const gateways = await this.prisma.paymentGateway.findMany({
      where: { tenantId, isActive: true },
      orderBy: { type: 'asc' },
    });

    const accounts = gateways.flatMap((gateway) => {
      const list: Array<{
        provider: string;
        accountType: 'merchant' | 'personal';
        number: string;
        label: string | null;
        instructions: string | null;
      }> = [];

      if (gateway.merchantActive && gateway.merchantNumber) {
        list.push({
          provider: gateway.type,
          accountType: 'merchant',
          number: gateway.merchantNumber,
          label: gateway.label,
          instructions: gateway.instructions,
        });
      }

      if (gateway.personalActive && gateway.personalNumber) {
        list.push({
          provider: gateway.type,
          accountType: 'personal',
          number: gateway.personalNumber,
          label: gateway.personalLabel,
          instructions: gateway.personalInstructions,
        });
      }

      return list;
    });

    const primary = accounts[0];
    return {
      available: accounts.length > 0,
      accounts,
      ...(primary
        ? {
            method: primary.provider,
            merchantNumber: primary.number,
            label: primary.label,
            instructions: primary.instructions,
          }
        : {}),
    };
  }

  private async findPortalClient(actor: AuthUser) {
    return this.prisma.client.findFirst({
      where: { tenantId: actor.tenantId, mobile: actor.mobile },
      include: { area: true, billingProfile: true },
    });
  }

  private async assertInvoice(tenantId: string, clientId: string, invoiceId: string) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, tenantId, clientId },
    });
    if (!invoice) throw new NotFoundException('Invoice not found for this client');
    return invoice;
  }

  private async isAutoRechargeEnabled(tenantId: string) {
    const setting = await this.prisma.setting.findUnique({
      where: { tenantId_key: { tenantId, key: 'auto_recharge_enabled' } },
    });
    return setting?.value === 'true';
  }

  private async postLedger(
    tenantId: string,
    transactionId: string,
    debitCode: string,
    creditCode: string,
    amount: number,
    refType: string,
    refId: string,
    clientId?: string | null,
  ) {
    const debit = await this.ensureAccount(tenantId, debitCode);
    const credit = await this.ensureAccount(tenantId, creditCode);

    await this.prisma.ledgerEntry.createMany({
      data: [
        {
          tenantId,
          accountId: debit.id,
          transactionId,
          clientId: clientId ?? null,
          debit: amount,
          credit: 0,
          refType,
          refId,
        },
        {
          tenantId,
          accountId: credit.id,
          transactionId,
          clientId: clientId ?? null,
          debit: 0,
          credit: amount,
          refType,
          refId,
        },
      ],
    });
  }

  private async ensureAccount(tenantId: string, code: string) {
    const names: Record<string, { name: string; type: string }> = {
      '1000': { name: 'Cash / Bank', type: 'asset' },
      '1100': { name: 'Client Wallet', type: 'liability' },
      '4000': { name: 'Service Revenue', type: 'revenue' },
      '5000': { name: 'Upstream Cost', type: 'expense' },
    };
    const meta = names[code] ?? { name: `Account ${code}`, type: 'asset' };

    return this.prisma.ledgerAccount.upsert({
      where: { tenantId_code: { tenantId, code } },
      update: {},
      create: { tenantId, code, ...meta },
    });
  }

  private async audit(
    actor: AuthUser,
    action: string,
    entityId: string,
    after: unknown,
  ) {
    await this.prisma.auditLog
      .create({
        data: {
          tenantId: actor.tenantId,
          actorId: actor.id,
          action,
          entityType: 'payment',
          entityId,
          after: JSON.stringify(after),
        },
      })
      .catch(() => undefined);
  }
}

function isUniqueError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'
  );
}
