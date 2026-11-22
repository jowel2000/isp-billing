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
import { UpdateUserDto } from './dto/update-user.dto';

const SAFE_USER_SELECT = {
  id: true,
  name: true,
  mobile: true,
  loginId: true,
  userCode: true,
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
    const isSuperAdmin = actor.role === 'super_admin';
    const showArchived = isSuperAdmin && query.archived === 'true';

    const allowedRoles =
      isSuperAdmin
        ? requestedRole
          ? [requestedRole]
          : undefined
        : requestedRole && ['staff', 'client'].includes(requestedRole)
          ? [requestedRole]
          : ['staff', 'client'];

    const search = query.search?.trim();
    const searchWhere = search
      ? {
          OR: [
            { userCode: { contains: search } },
            { mobile: { contains: search } },
            { loginId: { contains: search } },
            { name: { contains: search } },
          ],
        }
      : {};

    return this.prisma.user.findMany({
      where: {
        tenantId: actor.tenantId,
        // Archived users are hidden from everyone except the Super Admin
        // (who can list them with ?archived=true).
        status: showArchived
          ? 'archived'
          : { notIn: ['deleted', 'archived'] },
        ...(allowedRoles ? { role: { name: { in: allowedRoles } } } : {}),
        ...searchWhere,
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

    // Soft delete: move to "archived" instead of removing the record.
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: target.id },
        data: { status: 'archived', deletedAt: new Date() },
      }),
      this.prisma.refreshToken.updateMany({
        where: { userId: target.id, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    await this.audit(actor, 'user.archive', 'user', target.id, {
      loginId: target.loginId,
      mobile: target.mobile,
      role: target.role.name,
    });

    return { success: true };
  }

  /** Only the Super Admin can bring an archived user back. */
  async restoreUser(actor: AuthUser, userId: string) {
    if (actor.role !== 'super_admin') {
      throw new ForbiddenException('Only the Super Admin can restore archived users');
    }

    const target = await this.prisma.user.findFirst({
      where: { id: userId, tenantId: actor.tenantId, status: 'archived' },
      include: { role: true },
    });
    if (!target) {
      throw new NotFoundException('Archived user not found');
    }

    const updated = await this.prisma.user.update({
      where: { id: target.id },
      data: { status: 'active', deletedAt: null },
      select: SAFE_USER_SELECT,
    });

    await this.audit(actor, 'user.restore', 'user', target.id, {
      loginId: target.loginId,
      role: target.role.name,
    });

    return updated;
  }

  async updateUser(actor: AuthUser, userId: string, dto: UpdateUserDto) {
    const target = await this.findManageableUser(actor, userId);

    if (dto.mobile && dto.mobile !== target.mobile) {
      const existing = await this.prisma.user.findUnique({
        where: { tenantId_mobile: { tenantId: actor.tenantId, mobile: dto.mobile } },
      });
      if (existing) {
        throw new ConflictException('A user with this mobile number already exists');
      }
    }

    if (dto.loginId && dto.loginId !== target.loginId) {
      const existingLogin = await this.prisma.user.findFirst({
        where: { tenantId: actor.tenantId, loginId: dto.loginId },
      });
      if (existingLogin) {
        throw new ConflictException('This login ID is already taken');
      }
    }

    const updated = await this.prisma.user.update({
      where: { id: target.id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.mobile !== undefined ? { mobile: dto.mobile } : {}),
        ...(dto.loginId !== undefined ? { loginId: dto.loginId } : {}),
        ...(dto.email !== undefined ? { email: dto.email } : {}),
      },
      select: SAFE_USER_SELECT,
    });

    await this.audit(actor, 'user.update', 'user', target.id, {
      name: dto.name,
      mobile: dto.mobile,
      loginId: dto.loginId,
    });

    return updated;
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
    // Role selection is no longer exposed in the UI: the role is derived
    // from the section the admin is in (Admin tab → admin, Staff tab → staff).
    const roleName = dto.roleName ?? 'staff';

    const role = await this.prisma.role.findUnique({
      where: { tenantId_name: { tenantId: actor.tenantId, name: roleName } },
    });

    if (!role) {
      throw new BadRequestException(`Unknown role: ${roleName}`);
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

    // Every user gets a unique individual User ID automatically.
    const userCode = await this.generateUserCode(actor.tenantId);

    const user = await this.prisma.user.create({
      data: {
        tenantId: actor.tenantId,
        name: dto.name,
        mobile: dto.mobile,
        loginId: dto.loginId,
        userCode,
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
      userCode,
      role: roleName,
      areaIds,
    });

    return user;
  }

  /** Generates a unique 5-digit User ID for the tenant (e.g. 10001). */
  private async generateUserCode(tenantId: string): Promise<string> {
    for (let attempt = 0; attempt < 25; attempt += 1) {
      const code = String(10000 + Math.floor(Math.random() * 90000));
      const existing = await this.prisma.user.findUnique({
        where: { tenantId_userCode: { tenantId, userCode: code } },
        select: { id: true },
      });
      if (!existing) return code;
    }
    throw new BadRequestException('Could not allocate a unique User ID');
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
