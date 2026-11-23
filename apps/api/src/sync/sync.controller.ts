import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequireRoles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { AuthUser } from '../auth/types/auth-user';
import { SyncErrorListDto } from './dto/sync-error-list.dto';
import { SyncStatusService } from './sync-status.service';

@Controller('sync')
@UseGuards(JwtAuthGuard, PermissionsGuard, RolesGuard)
export class SyncController {
  constructor(private readonly syncStatus: SyncStatusService) {}

  /** Top status bar — Staff / Admin / Super Admin only. */
  @Get('status')
  @RequireRoles('super_admin', 'admin', 'staff')
  status(@CurrentUser() user: AuthUser) {
    return this.syncStatus.status(user.tenantId);
  }

  /** Super Admin error log. */
  @Get('errors')
  @RequireRoles('super_admin')
  errors(@CurrentUser() user: AuthUser, @Query() query: SyncErrorListDto) {
    return this.syncStatus.errors(user.tenantId, query);
  }

  @Get('errors/:id')
  @RequireRoles('super_admin')
  error(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.syncStatus.errorById(user.tenantId, id);
  }
}
