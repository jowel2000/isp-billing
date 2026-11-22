import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthUser } from './types/auth-user';

interface TokenMeta {
  ip?: string;
  userAgent?: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  private get accessSecret(): string {
    return this.config.get<string>('JWT_ACCESS_SECRET') || 'dev-access-secret';
  }

  private get refreshDays(): number {
    return Number(this.config.get<string>('JWT_REFRESH_TTL_DAYS') || 7);
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  async login(identity: string, password: string, meta: TokenMeta = {}) {
    if (!identity) {
      throw new UnauthorizedException('Login ID is required');
    }

    const user = await this.prisma.user.findFirst({
      where: {
        OR: [{ loginId: identity }, { mobile: identity }],
      },
      include: { role: { select: { name: true } } },
      orderBy: { createdAt: 'asc' },
    });

    if (!user) {
      await this.logLogin({
        loginId: identity,
        role: null,
        success: false,
        meta,
      });
      throw new UnauthorizedException('Invalid login ID or password');
    }

    const passwordMatches = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatches) {
      await this.logLogin({
        tenantId: user.tenantId,
        userId: user.id,
        loginId: user.loginId ?? identity,
        role: user.role.name,
        success: false,
        meta,
      });
      throw new UnauthorizedException('Invalid login ID or password');
    }

    if (user.status !== 'active') {
      await this.logLogin({
        tenantId: user.tenantId,
        userId: user.id,
        loginId: user.loginId ?? identity,
        role: user.role.name,
        success: false,
        meta,
      });
      throw new UnauthorizedException('This account is not active');
    }

    let clientId: string | null = null;
    if (user.role.name === 'client') {
      const client = await this.prisma.client.findFirst({
        where: { tenantId: user.tenantId, mobile: user.mobile },
        select: { id: true },
      });
      clientId = client?.id ?? null;
    }

    await this.logLogin({
      tenantId: user.tenantId,
      userId: user.id,
      clientId,
      loginId: user.loginId ?? identity,
      role: user.role.name,
      success: true,
      meta,
    });

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    await this.prisma.auditLog
      .create({
        data: {
          tenantId: user.tenantId,
          actorId: user.id,
          action: 'auth.login',
          entityType: 'user',
          entityId: user.id,
          ip: meta.ip,
        },
      })
      .catch(() => undefined);

    const authUser = await this.buildAuthUser(user.id);
    return this.issueTokens(authUser, meta);
  }

  async refresh(refreshToken: string, meta: TokenMeta = {}) {
    const record = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: this.hashToken(refreshToken) },
      include: { user: true },
    });

    if (
      !record ||
      record.revokedAt ||
      record.expiresAt.getTime() <= Date.now() ||
      record.user.status !== 'active'
    ) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    await this.prisma.refreshToken.update({
      where: { id: record.id },
      data: { revokedAt: new Date() },
    });

    const authUser = await this.buildAuthUser(record.userId);
    return this.issueTokens(authUser, meta);
  }

  async logout(refreshToken: string) {
    if (refreshToken) {
      await this.prisma.refreshToken.updateMany({
        where: { tokenHash: this.hashToken(refreshToken), revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    return { success: true };
  }

  /**
   * Forgot password — step 1. Generates a 6-digit OTP and stores its hash.
   * A real SMS gateway would deliver the OTP here; until then it is returned
   * in the response so the flow can be tested locally.
   */
  async requestPasswordReset(identifier: string) {
    const user = await this.prisma.user.findFirst({
      where: {
        OR: [{ loginId: identifier }, { mobile: identifier }],
      },
    });

    if (!user) {
      throw new BadRequestException('No account found with this Login ID or mobile');
    }

    const otp = String(Math.floor(100000 + Math.random() * 900000));
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    await this.prisma.otpRequest.create({
      data: {
        tenantId: user.tenantId,
        context: identifier.trim().toLowerCase(),
        codeHash: this.hashToken(otp),
        expiresAt,
      },
    });

    return {
      sent: true,
      devOtp: otp,
      expiresIn: 300,
      note: 'SMS gateway is not configured — OTP returned for local testing',
    };
  }

  /** Forgot password — step 2. Verifies the OTP and issues a short reset token. */
  async verifyPasswordReset(identifier: string, otp: string) {
    const context = identifier.trim().toLowerCase();

    const record = await this.prisma.otpRequest.findFirst({
      where: {
        context,
        status: 'pending',
        expiresAt: { gt: new Date() },
      },
      orderBy: { requestedAt: 'desc' },
    });

    if (!record || !record.codeHash || record.codeHash !== this.hashToken(otp)) {
      throw new UnauthorizedException('OTP is incorrect or expired');
    }

    const user = await this.prisma.user.findFirst({
      where: {
        OR: [{ loginId: identifier }, { mobile: identifier }],
      },
    });
    if (!user) {
      throw new BadRequestException('No account found with this Login ID or mobile');
    }

    await this.prisma.otpRequest.update({
      where: { id: record.id },
      data: { status: 'responded', respondedAt: new Date(), respondedBy: user.id },
    });

    const resetToken = await this.jwt.signAsync(
      { sub: user.id, type: 'reset' },
      { secret: this.accessSecret, expiresIn: '10m' },
    );

    return { verified: true, resetToken };
  }

  /** Forgot password — step 3. Updates the password and revokes sessions. */
  async resetPassword(resetToken: string, newPassword: string, loginId?: string) {
    let payload: { sub?: string; type?: string };
    try {
      payload = await this.jwt.verifyAsync(resetToken, {
        secret: this.accessSecret,
      });
    } catch {
      throw new UnauthorizedException('Reset link is invalid or expired');
    }

    if (!payload || payload.type !== 'reset' || !payload.sub) {
      throw new UnauthorizedException('Reset link is invalid');
    }

    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || user.status !== 'active') {
      throw new UnauthorizedException('Account not found or inactive');
    }

    const nextLoginId = loginId?.trim() || user.loginId || '';
    if (!nextLoginId) {
      throw new BadRequestException('Login ID is required');
    }

    if (nextLoginId.toLowerCase() !== (user.loginId ?? '').toLowerCase()) {
      const existing = await this.prisma.user.findUnique({
        where: {
          tenantId_loginId: { tenantId: user.tenantId, loginId: nextLoginId },
        },
      });
      if (existing && existing.id !== user.id) {
        throw new BadRequestException('This Login ID is already in use');
      }
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);

    await this.prisma.user.update({
      where: { id: user.id },
      data: { loginId: nextLoginId, passwordHash },
    });

    await this.prisma.refreshToken.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    await this.prisma.auditLog
      .create({
        data: {
          tenantId: user.tenantId,
          actorId: user.id,
          action: 'auth.password_reset',
          entityType: 'user',
          entityId: user.id,
        },
      })
      .catch(() => undefined);

    return { success: true };
  }

  async buildAuthUser(userId: string): Promise<AuthUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        role: { include: { rolePermissions: true } },
        permissionOverrides: true,
        areaScopes: true,
      },
    });

    if (!user || user.status !== 'active') {
      throw new UnauthorizedException('User is not active');
    }

    const permissions = new Set(user.role.rolePermissions.map((item) => item.permissionKey));
    for (const override of user.permissionOverrides) {
      if (override.effect === 'allow') permissions.add(override.permissionKey);
      if (override.effect === 'deny') permissions.delete(override.permissionKey);
    }

    return {
      id: user.id,
      tenantId: user.tenantId,
      name: user.name,
      mobile: user.mobile,
      email: user.email,
      role: user.role.name,
      roleLevel: user.role.level,
      permissions: [...permissions],
      areaIds: user.areaScopes.map((scope) => scope.areaId),
    };
  }

  private async logLogin(input: {
    tenantId?: string;
    userId?: string;
    clientId?: string | null;
    loginId: string;
    role: string | null;
    success: boolean;
    meta: TokenMeta;
  }) {
    await this.prisma.userLoginLog
      .create({
        data: {
          tenantId: input.tenantId,
          userId: input.userId,
          clientId: input.clientId ?? null,
          loginId: input.loginId,
          role: input.role,
          ip: input.meta.ip,
          userAgent: input.meta.userAgent,
          success: input.success,
        },
      })
      .catch(() => undefined);
  }

  private async issueTokens(user: AuthUser, meta: TokenMeta) {
    const accessToken = await this.jwt.signAsync(
      { sub: user.id, tenantId: user.tenantId, type: 'access' },
      {
        secret: this.accessSecret,
        expiresIn: (this.config.get<string>('JWT_ACCESS_TTL') || '15m') as never,
      },
    );

    const refreshToken = randomBytes(48).toString('hex');
    const expiresAt = new Date(Date.now() + this.refreshDays * 24 * 60 * 60 * 1000);

    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: this.hashToken(refreshToken),
        expiresAt,
        ip: meta.ip,
        userAgent: meta.userAgent,
      },
    });

    return {
      accessToken,
      refreshToken,
      expiresIn: 15 * 60,
      user,
    };
  }
}
