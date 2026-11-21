import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthUser } from '../auth/types/auth-user';
import { LogQueryDto } from './dto/log-query.dto';

@Injectable()
export class LogsService implements OnModuleInit {
  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    const timer = setInterval(() => {
      this.cleanup().catch(() => undefined);
    }, 24 * 60 * 60 * 1000);
    timer.unref?.();
    this.cleanup().catch(() => undefined);
  }

  async clientLogins(actor: AuthUser, query: LogQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where: any = {
      tenantId: actor.tenantId,
      role: 'client',
      ...(query.clientId ? { clientId: query.clientId } : {}),
      ...this.dateWhere(query),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.userLoginLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.userLoginLog.count({ where }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async userLogins(actor: AuthUser, query: LogQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    let roleFilter: any = undefined;
    if (actor.role === 'staff') {
      roleFilter = undefined;
    } else if (actor.role === 'admin') {
      roleFilter = { in: ['staff', 'client'] };
    } else if (query.role) {
      roleFilter = query.role;
    }

    const where: any = {
      tenantId: actor.tenantId,
      ...(roleFilter ? { role: roleFilter } : {}),
      ...(actor.role === 'staff' ? { userId: actor.id } : {}),
      ...(query.userId && actor.role !== 'staff' ? { userId: query.userId } : {}),
      ...this.dateWhere(query),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.userLoginLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.userLoginLog.count({ where }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async audit(actor: AuthUser, query: LogQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const where: any = {
      tenantId: actor.tenantId,
      ...(query.actorId && actor.role !== 'staff' ? { actorId: query.actorId } : {}),
      ...(query.module ? { action: { contains: query.module } } : {}),
      ...(query.entityType ? { entityType: query.entityType } : {}),
      ...this.dateWhere(query),
    };

    if (actor.role === 'staff') {
      where.actorId = actor.id;
    } else if (actor.role === 'admin') {
      where.OR = [
        { actorId: null },
        { actor: { is: { role: { name: { not: 'super_admin' } } } } },
      ];
    }

    const [data, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          actor: {
            select: {
              id: true,
              name: true,
              loginId: true,
              role: { select: { name: true } },
            },
          },
        },
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async cleanup() {
    const cutoff = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);

    await this.prisma.$transaction([
      this.prisma.userLoginLog.deleteMany({ where: { createdAt: { lt: cutoff } } }),
      this.prisma.auditLog.deleteMany({ where: { createdAt: { lt: cutoff } } }),
    ]);
  }

  private dateWhere(query: LogQueryDto) {
    if (!query.from && !query.to) return {};
    return {
      createdAt: {
        ...(query.from ? { gte: new Date(query.from) } : {}),
        ...(query.to ? { lte: new Date(query.to) } : {}),
      },
    };
  }
}
