import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthUser } from '../types/auth-user';

interface AccessTokenPayload {
  sub: string;
  tenantId: string;
  type: 'access';
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_ACCESS_SECRET') || 'dev-access-secret',
    });
  }

  async validate(payload: AccessTokenPayload): Promise<AuthUser> {
    if (payload.type !== 'access') {
      throw new UnauthorizedException('Invalid token type');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: {
        role: { include: { rolePermissions: true } },
        permissionOverrides: true,
        areaScopes: true,
      },
    });

    if (!user || user.status !== 'active' || user.tenantId !== payload.tenantId) {
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
}
