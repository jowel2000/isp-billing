import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import type { AuthUser } from '../auth/types/auth-user';
import { UpdateAutoRechargeDto } from './dto/update-auto-recharge.dto';
import { UpdatePaymentDto } from './dto/update-payment.dto';
import { UpdateSmsDto } from './dto/update-sms.dto';
import { UpdateTaxDto } from './dto/update-tax.dto';
import { SettingsService } from './settings.service';

@Controller('settings')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get('tax')
  @RequirePermissions('settings.tax')
  getTax(@CurrentUser() user: AuthUser) {
    return this.settingsService.getTax(user.tenantId);
  }

  @Put('tax')
  @RequirePermissions('settings.tax')
  updateTax(@CurrentUser() user: AuthUser, @Body() dto: UpdateTaxDto) {
    return this.settingsService.updateTax(user, dto);
  }

  @Get('payment')
  @RequirePermissions('settings.payment')
  getPayment(@CurrentUser() user: AuthUser) {
    return this.settingsService.getPayment(user.tenantId);
  }

  @Put('payment')
  @RequirePermissions('settings.payment')
  updatePayment(@CurrentUser() user: AuthUser, @Body() dto: UpdatePaymentDto) {
    return this.settingsService.updatePayment(user, dto);
  }

  @Get('sms')
  @RequirePermissions('settings.sms')
  getSms(@CurrentUser() user: AuthUser) {
    return this.settingsService.getSms(user.tenantId);
  }

  @Put('sms')
  @RequirePermissions('settings.sms')
  updateSms(@CurrentUser() user: AuthUser, @Body() dto: UpdateSmsDto) {
    return this.settingsService.updateSms(user, dto);
  }

  @Get('auto-recharge')
  @RequirePermissions('auto_recharge.toggle')
  getAutoRecharge(@CurrentUser() user: AuthUser) {
    return this.settingsService.getAutoRecharge(user.tenantId);
  }

  @Put('auto-recharge')
  @RequirePermissions('auto_recharge.toggle')
  updateAutoRecharge(
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateAutoRechargeDto,
  ) {
    return this.settingsService.updateAutoRecharge(user, dto);
  }
}
