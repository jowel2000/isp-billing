import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthUser } from '../auth/types/auth-user';
import { CreateUserDto } from './dto/create-user.dto';
import { ListUsersDto } from './dto/list-users.dto';
import { PermissionOverrideDto } from './dto/update-permissions.dto';

const SAFE_USER_SELECT = {
  id: true,
  name: true,
  mobile: true,
  loginId: true,
  email: true,
  status: true,
  lastLoginAt: true,
  createdAt: true,
  role: {
    select: {
      id: true,
      name: true,
      level: true,
      rolePermissions: { select: { permissionKey: true } },
    },
  },
  permissionOverrides: { select: { permissionKey: true, effect: true } },
  areaScopes: { select: { area: { select: { id: true, name: true } } } },
} as const;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(actor: AuthUser, query: ListUsersDto = {}) {
    const requestedRole = query.role;
    const allowedRoles =
      actor.role === 'super_admin'
        ? requestedRole
          ? [requestedRole]
          : undefined
        : requestedRole && ['staff', 'client'].includes(requestedRole)
          ? [requestedRole]
          : ['staff', 'client'];

    return this.prisma.user.findMany({
      where: {
        tenantId: actor.tenantId,
        status: { not: 'deleted' },
        ...(allowedRoles ? { role: { name: { in: allowedRoles } } } : {}),
      },
      select: SAFE_USER_SELECT,
      orderBy: [{ role: { level: 'asc' } }, { createdAt: 'asc' }],
    });
  }

  async deleteUser(actor: AuthUser, userId: string) {
    if (actor.id === userId) {
      throw new BadRequestException('You cannot delete your own account');
    }

    const target = await this.findManageableUser(actor, userId);
    if (target.role.name === 'super_admin') {
      throw new ForbiddenException('Super Admin cannot be deleted');
    }

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: target.id },
        data: { status: 'deleted', deletedAt: new Date() },
      }),
      this.prisma.refreshToken.updateMany({
        where: { userId: target.id, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    await this.audit(actor, 'user.delete', 'user', target.id, {
      loginId: target.loginId,
      mobile: target.mobile,
      role: target.role.name,
    });

    return { success: true };
  }

  async listRoles(actor: AuthUser) {
    return this.prisma.role.findMany({
      where: { tenantId: actor.tenantId },
      orderBy: { level: 'asc' },
      select: { id: true, name: true, level: true, isSystem: true },
    });
  }

  async listPermissions() {
    return this.prisma.permission.findMany({ orderBy: { key: 'asc' } });
  }

  async create(actor: AuthUser, dto: CreateUserDto) {
    const role = await this.prisma.role.findUnique({
      where: { tenantId_name: { tenantId: actor.tenantId, name: dto.roleName } },
    });

    if (!role) {
      throw new BadRequestException(`Unknown role: ${dto.roleName}`);
    }

    this.assertCanManageRole(actor, role.level);

    const existing = await this.prisma.user.findUnique({
      where: { tenantId_mobile: { tenantId: actor.tenantId, mobile: dto.mobile } },
    });

    if (existing) {
      throw new ConflictException('A user with this mobile number already exists');
    }

    const existingLogin = await this.prisma.user.findFirst({
      where: { tenantId: actor.tenantId, loginId: dto.loginId },
    });

    if (existingLogin) {
      throw new ConflictException('This login ID is already taken');
    }

    const areaIds = dto.areaIds ?? [];
    await this.assertAreasBelongToTenant(actor.tenantId, areaIds);

    const passwordHash = await bcrypt.hash(dto.password, 12);

    const user = await this.prisma.user.create({
      data: {
        tenantId: actor.tenantId,
        name: dto.name,
        mobile: dto.mobile,
        loginId: dto.loginId,
        passwordHash,
        roleId: role.id,
        areaScopes: areaIds.length
          ? { create: areaIds.map((areaId) => ({ areaId })) }
          : undefined,
      },
      select: SAFE_USER_SELECT,
    });

    await this.audit(actor, 'user.create', 'user', user.id, {
      name: dto.name,
      mobile: dto.mobile,
      loginId: dto.loginId,
      role: dto.roleName,
      areaIds,
    });

    return user;
  }

  async updatePermissions(actor: AuthUser, userId: string, overrides: PermissionOverrideDto[]) {
    const target = await this.findManageableUser(actor, userId);

    const actorPermissions = new Set(actor.permissions);
    for (const override of overrides) {
      if (!actorPermissions.has(override.permissionKey)) {
        throw new ForbiddenException(
          `You cannot grant a permission you do not have: ${override.permissionKey}`,
        );
      }
    }

    const keys = overrides.map((item) => item.permissionKey);
    const found = await this.prisma.permission.findMany({ where: { key: { in: keys } } });
    if (found.length !== new Set(keys).size) {
      throw new BadRequestException('One or more permissions do not exist');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.userPermissionOverride.deleteMany({ where: { userId: target.id } });
      if (overrides.length) {
        await tx.userPermissionOverride.createMany({
          data: overrides.map((item) => ({
            userId: target.id,
            permissionKey: item.permissionKey,
            effect: item.effect,
          })),
        });
      }
    });

    await this.audit(actor, 'user.permissions.update', 'user', target.id, { overrides });
    return this.prisma.user.findUniqueOrThrow({
      where: { id: target.id },
      select: SAFE_USER_SELECT,
    });
  }

  async updateAreas(actor: AuthUser, userId: string, areaIds: string[]) {
    const target = await this.findManageableUser(actor, userId);
    await this.assertAreasBelongToTenant(actor.tenantId, areaIds);

    await this.prisma.$transaction(async (tx) => {
      await tx.userAreaScope.deleteMany({ where: { userId: target.id } });
      if (areaIds.length) {
        await tx.userAreaScope.createMany({
          data: areaIds.map((areaId) => ({ userId: target.id, areaId })),
        });
      }
    });

    await this.audit(actor, 'user.areas.update', 'user', target.id, { areaIds });
    return this.prisma.user.findUniqueOrThrow({
      where: { id: target.id },
      select: SAFE_USER_SELECT,
    });
  }

  async resetPassword(actor: AuthUser, userId: string, password: string) {
    const target = await this.findManageableUser(actor, userId);
    const passwordHash = await bcrypt.hash(password, 12);

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: target.id },
        data: { passwordHash },
      }),
      this.prisma.refreshToken.updateMany({
        where: { userId: target.id, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    await this.audit(actor, 'user.password.reset', 'user', target.id, {});
    return { success: true };
  }

  async updateStatus(actor: AuthUser, userId: string, status: 'active' | 'disabled') {
    if (actor.id === userId) {
      throw new BadRequestException('You cannot change your own status');
    }

    const target = await this.findManageableUser(actor, userId);
    const updated = await this.prisma.user.update({
      where: { id: target.id },
      data: { status },
      select: SAFE_USER_SELECT,
    });

    await this.audit(actor, 'user.status.update', 'user', target.id, { status });
    return updated;
  }

  private async findManageableUser(actor: AuthUser, userId: string) {
    const target = await this.prisma.user.findFirst({
      where: { id: userId, tenantId: actor.tenantId, status: { not: 'deleted' } },
      include: { role: true },
    });

    if (!target) {
      throw new NotFoundException('User not found');
    }

    if (actor.id === target.id && actor.role !== 'super_admin') {
      throw new ForbiddenException('You cannot modify your own permissions');
    }

    this.assertCanManageRole(actor, target.role.level);

    if (target.role.name === 'super_admin' && actor.role !== 'super_admin') {
      throw new ForbiddenException('Only a super admin can manage a super admin');
    }

    return target;
  }

  private assertCanManageRole(actor: AuthUser, targetRoleLevel: number) {
    if (actor.role !== 'super_admin' && targetRoleLevel <= actor.roleLevel) {
      throw new ForbiddenException('You cannot manage a user with equal or higher role');
    }
  }

  private async assertAreasBelongToTenant(tenantId: string, areaIds: string[]) {
    if (areaIds.length === 0) return;

    const areas = await this.prisma.area.findMany({
      where: { tenantId, id: { in: areaIds } },
      select: { id: true },
    });

    if (areas.length !== new Set(areaIds).size) {
      throw new BadRequestException('One or more areas do not belong to this tenant');
    }
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
