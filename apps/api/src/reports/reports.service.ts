import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

interface DateRange {
  from?: string;
  to?: string;
}

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async collection(tenantId: string, range: DateRange) {
    const where = {
      tenantId,
      status: 'verified',
      ...this.dateWhere(range),
    };

    const grouped = await this.prisma.payment.groupBy({
      by: ['method'],
      where,
      _sum: { amount: true },
      _count: { _all: true },
    });

    const totalPaisa = grouped.reduce(
      (sum, row) => sum + Number(row._sum.amount ?? 0),
      0,
    );

    return {
      from: range.from ?? null,
      to: range.to ?? null,
      totalPaisa,
      count: grouped.reduce((sum, row) => sum + row._count._all, 0),
      byMethod: grouped.map((row) => ({
        method: row.method,
        count: row._count._all,
        totalPaisa: Number(row._sum.amount ?? 0),
      })),
    };
  }

  async monthlyCollection(tenantId: string) {
    const payments = await this.prisma.payment.findMany({
      where: { tenantId, status: 'verified' },
      select: { amount: true, createdAt: true },
    });

    const now = new Date();
    const buckets = new Map<string, { month: string; totalPaisa: number }>();

    for (let offset = 7; offset >= 0; offset -= 1) {
      const date = new Date(now.getFullYear(), now.getMonth() - offset, 1);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      buckets.set(key, {
        month: date.toLocaleString('en', { month: 'short' }),
        totalPaisa: 0,
      });
    }

    for (const payment of payments) {
      const key = `${payment.createdAt.getFullYear()}-${String(
        payment.createdAt.getMonth() + 1,
      ).padStart(2, '0')}`;
      const bucket = buckets.get(key);
      if (bucket) bucket.totalPaisa += Number(payment.amount);
    }

    return { data: [...buckets.values()] };
  }

  async due(tenantId: string) {
    const invoices = await this.prisma.invoice.findMany({
      where: { tenantId, dueAmount: { gt: 0 } },
      orderBy: { dueAmount: 'desc' },
      include: {
        client: {
          select: {
            id: true,
            name: true,
            publicId: true,
            mobile: true,
            area: { select: { name: true } },
          },
        },
      },
    });

    const totalDuePaisa = invoices.reduce(
      (sum, invoice) => sum + Number(invoice.dueAmount),
      0,
    );

    return {
      totalDuePaisa,
      count: invoices.length,
      top: invoices.slice(0, 20),
    };
  }

  async vat(tenantId: string, range: DateRange) {
    const where = {
      tenantId,
      status: { notIn: ['waived', 'draft'] },
      ...this.dateWhere(range),
    };

    const aggregate = await this.prisma.invoice.aggregate({
      where,
      _sum: { taxAmount: true, total: true },
      _count: { _all: true },
    });

    return {
      from: range.from ?? null,
      to: range.to ?? null,
      invoiceCount: aggregate._count._all,
      vatPaisa: Number(aggregate._sum.taxAmount ?? 0),
      invoicedPaisa: Number(aggregate._sum.total ?? 0),
    };
  }

  async profit(tenantId: string, range: DateRange) {
    const payments = await this.prisma.payment.findMany({
      where: {
        tenantId,
        status: 'verified',
        ...this.dateWhere(range),
      },
      include: {
        invoice: { select: { taxRate: true } },
        rechargeJobs: { select: { upstreamCostPaisa: true } },
      },
    });

    let collectedPaisa = 0;
    let vatPaisa = 0;
    let upstreamCostPaisa = 0;

    for (const payment of payments) {
      const amount = Number(payment.amount);
      collectedPaisa += amount;

      const taxRate = payment.invoice?.taxRate ?? 0;
      if (taxRate > 0) {
        vatPaisa += Math.round((amount * taxRate) / (10000 + taxRate));
      }

      upstreamCostPaisa += payment.rechargeJobs.reduce(
        (sum, job) => sum + Number(job.upstreamCostPaisa),
        0,
      );
    }

    const revenuePaisa = Math.max(0, collectedPaisa - vatPaisa);

    return {
      from: range.from ?? null,
      to: range.to ?? null,
      collectedPaisa,
      vatPaisa,
      revenuePaisa,
      upstreamCostPaisa,
      grossMarginPaisa: revenuePaisa - upstreamCostPaisa,
    };
  }

  async rechargeJobs(tenantId: string, query: { clientId?: string; status?: string; from?: string; to?: string; page?: number; limit?: number }) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const where: any = {
      tenantId,
      ...(query.clientId ? { clientId: query.clientId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...this.dateWhere(query),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.rechargeJob.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          client: { select: { id: true, name: true, publicId: true, paymentCode: true } },
          invoice: { select: { id: true, number: true } },
          payment: { select: { id: true, trxId: true, referenceCode: true, provider: true, accountType: true } },
        },
      }),
      this.prisma.rechargeJob.count({ where }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async ledger(tenantId: string, query: { clientId?: string; from?: string; to?: string; page?: number; limit?: number }) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const where: any = {
      tenantId,
      ...(query.clientId ? { clientId: query.clientId } : {}),
      ...this.dateWhere(query),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.ledgerEntry.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          account: { select: { code: true, name: true, type: true } },
          client: { select: { id: true, name: true, publicId: true, paymentCode: true } },
        },
      }),
      this.prisma.ledgerEntry.count({ where }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  private dateWhere(range: DateRange) {
    if (!range.from && !range.to) return {};
    return {
      createdAt: {
        ...(range.from ? { gte: new Date(range.from) } : {}),
        ...(range.to ? { lte: new Date(range.to) } : {}),
      },
    };
  }
}
