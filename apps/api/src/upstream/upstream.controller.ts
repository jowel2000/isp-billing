import { Controller, Get, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import type { AuthUser } from '../auth/types/auth-user';
import { UpstreamService } from './upstream.service';

@Controller('upstream')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class UpstreamController {
  constructor(private readonly upstreamService: UpstreamService) {}

  @Get('status')
  @RequirePermissions('upstream.manage')
  status(@CurrentUser() user: AuthUser) {
    return this.upstreamService.status(user.tenantId);
  }
}
