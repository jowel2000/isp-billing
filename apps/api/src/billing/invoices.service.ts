import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@isp/db';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthUser } from '../auth/types/auth-user';
import {
  CreateInvoiceDto,
  ListInvoicesDto,
  WaiveInvoiceDto,
} from './dto/invoice.dto';

@Injectable()
export class InvoicesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(actor: AuthUser, dto: CreateInvoiceDto) {
    const client = await this.prisma.client.findFirst({
      where: { id: dto.clientId, tenantId: actor.tenantId },
      include: {
        billingProfile: true,
        subscriptions: {
          where: { status: 'active' },
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: { package: true },
        },
      },
    });
    if (!client) throw new NotFoundException('Client not found');

    const subscription = client.subscriptions[0];
    const items =
      dto.items && dto.items.length
        ? dto.items
        : [
            {
              description: subscription
                ? `${subscription.package.name} — monthly bill`
                : 'Monthly internet bill',
              quantity: 1,
              unitPricePaisa: Number(
                client.billingProfile?.monthlyAmountOverride ??
                  subscription?.package.localPrice ??
                  0,
              ),
            },
          ];

    if (items.some((item) => item.unitPricePaisa <= 0)) {
      throw new BadRequestException('Invoice items must have a positive unit price');
    }

    const subtotal = items.reduce(
      (sum, item) => sum + item.quantity * item.unitPricePaisa,
      0,
    );
    const discount = Math.min(dto.discountPaisa ?? 0, subtotal);
    const taxable = subtotal - discount;

    const taxSetting = await this.prisma.taxSetting.findUnique({
      where: { tenantId: actor.tenantId },
    });
    const rateBps = taxSetting?.enabled ? taxSetting.rateBps : 0;
    const inclusive = taxSetting?.inclusive ?? false;

    const taxAmount = rateBps
      ? inclusive
        ? Math.round(taxable - taxable / (1 + rateBps / 10000))
        : Math.round((taxable * rateBps) / 10000)
      : 0;
    const total = inclusive ? taxable : taxable + taxAmount;

    const tenant = await this.prisma.tenant.findUnique({ where: { id: actor.tenantId } });
    const number = await this.nextInvoiceNumber(actor.tenantId, tenant?.code ?? 'TRG');

    const invoice = await this.prisma.invoice.create({
      data: {
        tenantId: actor.tenantId,
        clientId: client.id,
        number,
        periodStart: dto.periodStart ? new Date(dto.periodStart) : undefined,
        periodEnd: dto.periodEnd ? new Date(dto.periodEnd) : undefined,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        subtotal,
        discount,
        taxRate: rateBps,
        taxAmount,
        total,
        paidAmount: 0,
        dueAmount: total,
        status: total === 0 ? 'paid' : 'due',
        notes: dto.notes,
        items: {
          create: items.map((item) => ({
            description: item.description,
            quantity: item.quantity,
            unitPrice: item.unitPricePaisa,
            amount: item.quantity * item.unitPricePaisa,
          })),
        },
      },
      include: { items: true, client: true },
    });

    await this.audit(actor, 'invoice.create', invoice.id, {
      number,
      total,
      clientId: client.id,
    });

    return invoice;
  }

  async list(actor: AuthUser, query: ListInvoicesDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const where: Prisma.InvoiceWhereInput = {
      tenantId: actor.tenantId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.clientId ? { clientId: query.clientId } : {}),
      ...(query.search
        ? {
            OR: [
              { number: { contains: query.search } },
              { client: { name: { contains: query.search } } },
              { client: { publicId: { contains: query.search } } },
            ],
          }
        : {}),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.invoice.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          client: { select: { id: true, name: true, publicId: true, mobile: true } },
          items: true,
        },
      }),
      this.prisma.invoice.count({ where }),
    ]);

    return { data: rows, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async summary(tenantId: string) {
    const grouped = await this.prisma.invoice.groupBy({
      by: ['status'],
      where: { tenantId },
      _sum: { total: true, paidAmount: true, dueAmount: true },
      _count: { _all: true },
    });

    const totalInvoicedPaisa = grouped.reduce(
      (sum, row) => sum + Number(row._sum.total ?? 0),
      0,
    );
    const paidPaisa = grouped.reduce(
      (sum, row) => sum + Number(row._sum.paidAmount ?? 0),
      0,
    );
    const duePaisa = grouped.reduce(
      (sum, row) => sum + Number(row._sum.dueAmount ?? 0),
      0,
    );
    const overduePaisa = grouped
      .filter((row) => row.status === 'overdue')
      .reduce((sum, row) => sum + Number(row._sum.dueAmount ?? 0), 0);

    return {
      totalInvoicedPaisa,
      paidPaisa,
      duePaisa,
      overduePaisa,
      invoiceCount: grouped.reduce((sum, row) => sum + row._count._all, 0),
      byStatus: grouped.map((row) => ({
        status: row.status,
        count: row._count._all,
        totalPaisa: Number(row._sum.total ?? 0),
        paidPaisa: Number(row._sum.paidAmount ?? 0),
        duePaisa: Number(row._sum.dueAmount ?? 0),
      })),
    };
  }

  async get(actor: AuthUser, id: string) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id, tenantId: actor.tenantId },
      include: {
        client: true,
        items: true,
        payments: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');
    return invoice;
  }

  async waive(actor: AuthUser, id: string, dto: WaiveInvoiceDto) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id, tenantId: actor.tenantId },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');
    if (invoice.paidAmount > 0) {
      throw new BadRequestException('Cannot waive an invoice that has payments');
    }

    const updated = await this.prisma.invoice.update({
      where: { id },
      data: {
        discount: invoice.subtotal,
        taxRate: 0,
        taxAmount: 0,
        total: 0,
        dueAmount: 0,
        status: 'waived',
        notes: dto.reason ?? invoice.notes,
      },
    });

    await this.audit(actor, 'invoice.waive', id, { reason: dto.reason });
    return updated;
  }

  async send(actor: AuthUser, id: string) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id, tenantId: actor.tenantId },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');

    await this.audit(actor, 'invoice.send', id, {});
    return {
      sent: false,
      reason: 'SMS gateway is not configured yet (Phase 2 setting).',
    };
  }

  async applyPayment(invoiceId: string, amountPaisa: number) {
    const invoice = await this.prisma.invoice.findUnique({ where: { id: invoiceId } });
    if (!invoice) throw new NotFoundException('Invoice not found');

    const amount = BigInt(amountPaisa);
    const paidAmount =
      invoice.paidAmount + amount > invoice.total
        ? invoice.total
        : invoice.paidAmount + amount;
    const dueAmount = invoice.total > paidAmount ? invoice.total - paidAmount : 0n;
    const status = dueAmount === 0n ? 'paid' : 'partial';

    return this.prisma.invoice.update({
      where: { id: invoiceId },
      data: { paidAmount, dueAmount, status },
    });
  }

  private async nextInvoiceNumber(tenantId: string, tenantCode: string) {
    const now = new Date();
    const month = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
    const prefix = `INV-${tenantCode}-${month}-`;

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const count = await this.prisma.invoice.count({
        where: { tenantId, number: { startsWith: prefix } },
      });
      const number = `${prefix}${String(count + 1 + attempt).padStart(4, '0')}`;
      const exists = await this.prisma.invoice.findUnique({ where: { number } });
      if (!exists) return number;
    }

    throw new ConflictException('Could not allocate an invoice number');
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
          entityType: 'invoice',
          entityId,
          after: JSON.stringify(after),
        },
      })
      .catch(() => undefined);
  }
}
