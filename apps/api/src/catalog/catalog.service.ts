import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthUser } from '../auth/types/auth-user';
import {
  CreateAreaDto,
  CreatePackageDto,
  UpdateAreaDto,
  UpdatePackageDto,
} from './dto/catalog.dto';

@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService) {}

  listAreas(tenantId: string) {
    return this.prisma.area.findMany({
      where: { tenantId },
      orderBy: { name: 'asc' },
      include: { _count: { select: { clients: true } } },
    });
  }

  async createArea(actor: AuthUser, dto: CreateAreaDto) {
    const area = await this.prisma.area.create({
      data: { tenantId: actor.tenantId, ...dto },
    });
    await this.audit(actor, 'area.create', 'area', area.id, dto);
    return area;
  }

  async updateArea(actor: AuthUser, id: string, dto: UpdateAreaDto) {
    const area = await this.prisma.area.findFirst({
      where: { id, tenantId: actor.tenantId },
    });
    if (!area) throw new NotFoundException('Area not found');

    const updated = await this.prisma.area.update({ where: { id }, data: dto });
    await this.audit(actor, 'area.update', 'area', id, dto);
    return updated;
  }

  async listPackages(actor: AuthUser) {
    const packages = await this.prisma.package.findMany({
      where: { tenantId: actor.tenantId },
      orderBy: { name: 'asc' },
      include: {
        _count: {
          select: { subscriptions: { where: { status: 'active' } } },
        },
      },
    });

    const canViewCost = actor.permissions.includes('packages.view_cost');
    return packages.map((pkg) => ({
      ...pkg,
      upstreamPrice: canViewCost ? Number(pkg.upstreamPrice) : null,
    }));
  }

  async createPackage(actor: AuthUser, dto: CreatePackageDto) {
    if (
      dto.upstreamPricePaisa !== undefined &&
      !actor.permissions.includes('packages.view_cost')
    ) {
      throw new ForbiddenException('Missing permission: packages.view_cost');
    }

    const pkg = await this.prisma.package.create({
      data: {
        tenantId: actor.tenantId,
        name: dto.name,
        speedMbps: dto.speedMbps,
        upstreamPrice: dto.upstreamPricePaisa ?? 0,
        localPrice: dto.localPricePaisa ?? 0,
        cbp: dto.cbpPaisa ?? 0,
        status: dto.status ?? 'active',
        upstreamId: dto.upstreamId,
      },
    });
    await this.audit(actor, 'package.create', 'package', pkg.id, dto);
    return {
      ...pkg,
      upstreamPrice: actor.permissions.includes('packages.view_cost')
        ? Number(pkg.upstreamPrice)
        : null,
    };
  }

  async updatePackage(actor: AuthUser, id: string, dto: UpdatePackageDto) {
    const pkg = await this.prisma.package.findFirst({
      where: { id, tenantId: actor.tenantId },
    });
    if (!pkg) throw new NotFoundException('Package not found');

    if (
      dto.upstreamPricePaisa !== undefined &&
      !actor.permissions.includes('packages.view_cost')
    ) {
      throw new ForbiddenException('Missing permission: packages.view_cost');
    }

    const updated = await this.prisma.package.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.speedMbps !== undefined ? { speedMbps: dto.speedMbps } : {}),
        ...(dto.upstreamPricePaisa !== undefined
          ? { upstreamPrice: dto.upstreamPricePaisa }
          : {}),
        ...(dto.localPricePaisa !== undefined ? { localPrice: dto.localPricePaisa } : {}),
        ...(dto.cbpPaisa !== undefined ? { cbp: dto.cbpPaisa } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
        ...(dto.upstreamId !== undefined ? { upstreamId: dto.upstreamId } : {}),
      },
    });

    await this.audit(actor, 'package.update', 'package', id, dto);
    return {
      ...updated,
      upstreamPrice: actor.permissions.includes('packages.view_cost')
        ? Number(updated.upstreamPrice)
        : null,
    };
  }

  private async audit(
    actor: AuthUser,
    action: string,
    entityType: string,
    entityId: string,
    after: unknown,
  ) {
    await this.prisma.auditLog
      .create({
        data: {
          tenantId: actor.tenantId,
          actorId: actor.id,
          action,
          entityType,
          entityId,
          after: JSON.stringify(after),
        },
      })
      .catch(() => undefined);
  }
}
