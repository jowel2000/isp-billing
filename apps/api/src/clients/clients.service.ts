import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@isp/db';
import { decryptString, encryptString } from '../common/crypto';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthUser } from '../auth/types/auth-user';
import { CreateClientDto } from './dto/create-client.dto';
import { ListClientsDto } from './dto/list-clients.dto';
import { UpdateClientDto } from './dto/update-client.dto';

const ACTIVE_SUBSCRIPTION = {
  where: { status: 'active' },
  orderBy: { createdAt: 'desc' },
  take: 1,
  include: { package: true },
} as const;

@Injectable()
export class ClientsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(actor: AuthUser, query: ListClientsDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const where: Prisma.ClientWhereInput = {
      tenantId: actor.tenantId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.areaId ? { areaId: query.areaId } : {}),
      ...(query.packageId
        ? { subscriptions: { some: { packageId: query.packageId, status: 'active' } } }
        : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search } },
              { mobile: { contains: query.search } },
              { publicId: { contains: query.search } },
              { paymentCode: { contains: query.search } },
              { pppoeUsername: { contains: query.search } },
            ],
          }
        : {}),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.client.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          area: true,
          billingProfile: true,
          subscriptions: ACTIVE_SUBSCRIPTION,
        },
      }),
      this.prisma.client.count({ where }),
    ]);

    const dueMap = await this.dueMap(
      actor.tenantId,
      rows.map((row) => row.id),
    );

    return {
      data: rows.map((row) => this.toSafeClient(row, dueMap.get(row.id) ?? 0)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async get(actor: AuthUser, id: string) {
    const client = await this.prisma.client.findFirst({
      where: { id, tenantId: actor.tenantId },
      include: {
        area: true,
        billingProfile: true,
        subscriptions: ACTIVE_SUBSCRIPTION,
      },
    });

    if (!client) throw new NotFoundException('Client not found');
    const dueMap = await this.dueMap(actor.tenantId, [client.id]);
    return this.toSafeClient(client, dueMap.get(client.id) ?? 0);
  }

  async create(actor: AuthUser, dto: CreateClientDto) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: actor.tenantId } });
    if (!tenant) throw new NotFoundException('Tenant not found');

    await this.assertArea(actor.tenantId, dto.areaId);
    if (dto.packageId) await this.assertPackage(actor.tenantId, dto.packageId);

    const publicId = await this.nextPublicId(actor.tenantId, tenant.code);

    const client = await this.prisma.client.create({
      data: {
        tenantId: actor.tenantId,
        publicId,
        paymentCode: await this.nextPaymentCode(actor.tenantId),
        name: dto.name,
        mobile: dto.mobile,
        altMobile: dto.altMobile,
        areaId: dto.areaId,
        address: dto.address,
        billingType: dto.billingType ?? 'prepaid',
        status: dto.status ?? 'active',
        pppoeUsername: dto.pppoeUsername,
        pppoePasswordEnc: dto.pppoePassword ? encryptString(dto.pppoePassword) : null,
        ipAddress: dto.ipAddress,
        nidNumberEnc: dto.nidNumber ? encryptString(dto.nidNumber) : null,
        activatedAt: (dto.status ?? 'active') === 'active' ? new Date() : null,
        billingProfile: {
          create: {
            billingType: dto.billingType ?? 'prepaid',
            monthlyAmountOverride: dto.monthlyAmountPaisa,
            dueDay: dto.dueDay ?? 1,
            graceDays: dto.graceDays ?? 3,
            autoRecharge: dto.autoRecharge ?? false,
          },
        },
        subscriptions: dto.packageId
          ? {
              create: {
                packageId: dto.packageId,
                startAt: new Date(),
                status: 'active',
              },
            }
          : undefined,
      },
    });

    await this.audit(actor, 'client.create', client.id, {
      publicId,
      name: dto.name,
      mobile: dto.mobile,
    });

    return this.get(actor, client.id);
  }

  async update(actor: AuthUser, id: string, dto: UpdateClientDto) {
    const existing = await this.prisma.client.findFirst({
      where: { id, tenantId: actor.tenantId },
      include: { billingProfile: true, subscriptions: ACTIVE_SUBSCRIPTION },
    });
    if (!existing) throw new NotFoundException('Client not found');

    await this.assertArea(actor.tenantId, dto.areaId);
    if (dto.packageId) await this.assertPackage(actor.tenantId, dto.packageId);

    const data: Prisma.ClientUpdateInput = {
      ...(dto.name !== undefined ? { name: dto.name } : {}),
      ...(dto.mobile !== undefined ? { mobile: dto.mobile } : {}),
      ...(dto.altMobile !== undefined ? { altMobile: dto.altMobile } : {}),
      ...(dto.address !== undefined ? { address: dto.address } : {}),
      ...(dto.status !== undefined ? { status: dto.status } : {}),
      ...(dto.billingType !== undefined ? { billingType: dto.billingType } : {}),
      ...(dto.pppoeUsername !== undefined ? { pppoeUsername: dto.pppoeUsername } : {}),
      ...(dto.ipAddress !== undefined ? { ipAddress: dto.ipAddress } : {}),
      ...(dto.areaId !== undefined
        ? { area: dto.areaId ? { connect: { id: dto.areaId } } : { disconnect: true } }
        : {}),
      ...(dto.pppoePassword !== undefined
        ? { pppoePasswordEnc: dto.pppoePassword ? encryptString(dto.pppoePassword) : null }
        : {}),
      ...(dto.nidNumber !== undefined
        ? { nidNumberEnc: dto.nidNumber ? encryptString(dto.nidNumber) : null }
        : {}),
      ...(dto.status === 'active' && !existing.activatedAt
        ? { activatedAt: new Date() }
        : {}),
      billingProfile: {
        upsert: {
          create: {
            billingType: dto.billingType ?? existing.billingType,
            monthlyAmountOverride: dto.monthlyAmountPaisa,
            discount: dto.discountPaisa ?? 0,
            dueDay: dto.dueDay ?? 1,
            graceDays: dto.graceDays ?? 3,
            autoRenew: dto.autoRenew ?? true,
            autoRecharge: dto.autoRecharge ?? false,
          },
          update: {
            ...(dto.billingType !== undefined ? { billingType: dto.billingType } : {}),
            ...(dto.monthlyAmountPaisa !== undefined
              ? { monthlyAmountOverride: dto.monthlyAmountPaisa }
              : {}),
            ...(dto.discountPaisa !== undefined ? { discount: dto.discountPaisa } : {}),
            ...(dto.dueDay !== undefined ? { dueDay: dto.dueDay } : {}),
            ...(dto.graceDays !== undefined ? { graceDays: dto.graceDays } : {}),
            ...(dto.autoRenew !== undefined ? { autoRenew: dto.autoRenew } : {}),
            ...(dto.autoRecharge !== undefined ? { autoRecharge: dto.autoRecharge } : {}),
          },
        },
      },
    };

    await this.prisma.client.update({ where: { id }, data });

    if (dto.packageId && dto.packageId !== existing.subscriptions[0]?.packageId) {
      await this.prisma.$transaction([
        this.prisma.subscription.updateMany({
          where: { clientId: id, status: 'active' },
          data: { status: 'changed' },
        }),
        this.prisma.subscription.create({
          data: {
            clientId: id,
            packageId: dto.packageId,
            startAt: new Date(),
            status: 'active',
          },
        }),
      ]);
    }

    await this.audit(actor, 'client.update', id, {
      fields: Object.keys(dto),
    });

    return this.get(actor, id);
  }

  async reveal(actor: AuthUser, id: string, field: 'pppoe' | 'nid') {
    if (field === 'pppoe' && !actor.permissions.includes('clients.reveal_credentials')) {
      throw new ForbiddenException('Missing permission: clients.reveal_credentials');
    }
    if (field === 'nid' && !actor.permissions.includes('clients.view_nid')) {
      throw new ForbiddenException('Missing permission: clients.view_nid');
    }

    const client = await this.prisma.client.findFirst({
      where: { id, tenantId: actor.tenantId },
    });
    if (!client) throw new NotFoundException('Client not found');

    const encrypted = field === 'pppoe' ? client.pppoePasswordEnc : client.nidNumberEnc;
    if (!encrypted) throw new NotFoundException(`${field} is not set for this client`);

    let value: string;
    try {
      value = decryptString(encrypted);
    } catch {
      value = encrypted;
    }

    await this.audit(actor, `client.reveal.${field}`, id, { field });

    return { field, value };
  }

  async remove(actor: AuthUser, id: string) {
    const existing = await this.prisma.client.findFirst({
      where: { id, tenantId: actor.tenantId },
    });
    if (!existing) throw new NotFoundException('Client not found');

    await this.prisma.client.update({ where: { id }, data: { status: 'removed' } });
    await this.audit(actor, 'client.remove', id, { previousStatus: existing.status });
    return { success: true };
  }

  async loginHistory(actor: AuthUser, id: string) {
    const client = await this.prisma.client.findFirst({
      where: { id, tenantId: actor.tenantId },
    });
    if (!client) throw new NotFoundException('Client not found');

    return this.prisma.loginHistory.findMany({
      where: { tenantId: actor.tenantId, clientId: id },
      orderBy: { loginAt: 'desc' },
      take: 100,
    });
  }

  private toSafeClient(client: any, duePaisa = 0) {
    const safe = { ...client };
    const hasPppoePassword = Boolean(safe.pppoePasswordEnc);
    const hasNid = Boolean(safe.nidNumberEnc);
    delete safe.pppoePasswordEnc;
    delete safe.nidNumberEnc;
    return { ...safe, hasPppoePassword, hasNid, duePaisa };
  }

  private async dueMap(tenantId: string, clientIds: string[]): Promise<Map<string, number>> {
    if (clientIds.length === 0) return new Map();

    const grouped = await this.prisma.invoice.groupBy({
      by: ['clientId'],
      where: {
        tenantId,
        clientId: { in: clientIds },
        dueAmount: { gt: 0 },
      },
      _sum: { dueAmount: true },
    });

    return new Map(
      grouped.map((row) => [row.clientId, Number(row._sum.dueAmount ?? 0)]),
    );
  }

  private async nextPublicId(tenantId: string, tenantCode: string) {
    const count = await this.prisma.client.count({ where: { tenantId } });

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const sequence = String(count + 1 + attempt).padStart(6, '0');
      const publicId = `${tenantCode}-${sequence}-${luhnCheckDigit(sequence)}`;
      const exists = await this.prisma.client.findUnique({ where: { publicId } });
      if (!exists) return publicId;
    }

    throw new ConflictException('Could not allocate a client ID');
  }

  private async nextPaymentCode(tenantId: string): Promise<string> {
    const rows = await this.prisma.client.findMany({
      where: { tenantId, paymentCode: { not: null } },
      select: { paymentCode: true },
    });
    const used = new Set(rows.map((row) => row.paymentCode));

    for (let code = 1000; code <= 9999; code += 1) {
      const value = String(code);
      if (!used.has(value)) return value;
    }

    throw new ConflictException('No 4-digit payment codes are available');
  }

  private async assertArea(tenantId: string, areaId?: string) {
    if (!areaId) return;
    const area = await this.prisma.area.findFirst({ where: { id: areaId, tenantId } });
    if (!area) throw new BadRequestException('Area does not belong to this tenant');
  }

  private async assertPackage(tenantId: string, packageId: string) {
    const pkg = await this.prisma.package.findFirst({ where: { id: packageId, tenantId } });
    if (!pkg) throw new BadRequestException('Package does not belong to this tenant');
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
          entityType: 'client',
          entityId,
          after: JSON.stringify(after),
        },
      })
      .catch(() => undefined);
  }
}

function luhnCheckDigit(digits: string): number {
  let sum = 0;
  let double = true;
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    let digit = Number(digits[i]);
    if (double) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    double = !double;
  }
  return (10 - (sum % 10)) % 10;
}
