import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import type { AuthUser } from '../auth/types/auth-user';
import { PortalPaymentDto } from './dto/payment.dto';
import { PaymentsService } from './payments.service';

@Controller('me')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PortalController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Get('summary')
  @RequirePermissions('portal.view')
  summary(@CurrentUser() user: AuthUser) {
    return this.paymentsService.portalSummary(user);
  }

  @Get('invoices')
  @RequirePermissions('portal.invoices')
  invoices(@CurrentUser() user: AuthUser) {
    return this.paymentsService.portalInvoices(user);
  }

  @Get('payments')
  @RequirePermissions('portal.payments')
  payments(@CurrentUser() user: AuthUser) {
    return this.paymentsService.portalPayments(user);
  }

  @Get('payment-methods')
  @RequirePermissions('portal.view')
  paymentMethods(@CurrentUser() user: AuthUser) {
    return this.paymentsService.portalPaymentMethods(user.tenantId);
  }

  @Post('payments')
  @RequirePermissions('portal.pay')
  submit(@CurrentUser() user: AuthUser, @Body() dto: PortalPaymentDto) {
    return this.paymentsService.portalSubmit(user, dto);
  }
}
