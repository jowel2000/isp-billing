import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { RequireRoles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { AuthUser } from '../auth/types/auth-user';
import { UpstreamService } from './upstream.service';
import { UpstreamSyncService } from './upstream-sync.service';

@Controller('upstream')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class UpstreamController {
  constructor(
    private readonly upstreamService: UpstreamService,
    private readonly syncService: UpstreamSyncService,
  ) {}

  @Get('status')
  @RequirePermissions('upstream.manage')
  status(@CurrentUser() user: AuthUser) {
    return this.upstreamService.status(user.tenantId);
  }

  @Post('diagnose')
  @RequirePermissions('upstream.manage')
  diagnose(@CurrentUser() user: AuthUser) {
    return this.upstreamService.diagnose(user.tenantId);
  }

  @Post('sync')
  @RequirePermissions('upstream.manage')
  sync(
    @CurrentUser() user: AuthUser,
    @Body()
    body: {
      clients?: boolean;
      packages?: boolean;
      areas?: boolean;
      loginHistory?: boolean;
    },
  ) {
    return this.syncService.sync(user.tenantId, body ?? {}, {
      trigger: 'manual',
      userId: user.id,
    });
  }

  /**
   * Refresh button endpoint — strictly Super Admin / Admin / Staff only.
   * Logs in to the upstream, scrapes and syncs the data, and returns the
   * result together with the last updated timestamp.
   */
  @Post('refresh')
  @UseGuards(RolesGuard)
  @RequireRoles('super_admin', 'admin', 'staff')
  refresh(@CurrentUser() user: AuthUser) {
    return this.syncService.sync(user.tenantId, {}, { trigger: 'manual', userId: user.id });
  }
}
