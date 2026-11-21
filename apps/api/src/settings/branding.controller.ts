import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import type { AuthUser } from '../auth/types/auth-user';
import { UpdateBrandingDto } from './dto/update-branding.dto';
import { SettingsService } from './settings.service';

@Controller('settings/branding')
export class BrandingController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get('public')
  getPublicBranding() {
    return this.settingsService.getPublicBranding();
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Get()
  @RequirePermissions('settings.branding')
  getBranding(@CurrentUser() user: AuthUser) {
    return this.settingsService.getBranding(user.tenantId);
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Put()
  @RequirePermissions('settings.branding')
  updateBranding(@CurrentUser() user: AuthUser, @Body() dto: UpdateBrandingDto) {
    return this.settingsService.updateBranding(user, dto);
  }
}
