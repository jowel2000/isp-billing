import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import type { AuthUser } from '../auth/types/auth-user';
import {
  CreatePaymentDto,
  ListPaymentsDto,
  MatchPaymentDto,
  RejectPaymentDto,
} from './dto/payment.dto';
import { PaymentsService } from './payments.service';

@Controller('payments')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Get()
  @RequirePermissions('payments.view')
  list(@CurrentUser() user: AuthUser, @Query() query: ListPaymentsDto) {
    return this.paymentsService.list(user, query);
  }

  @Post()
  @RequirePermissions('payments.collect')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreatePaymentDto) {
    return this.paymentsService.create(user, dto);
  }

  @Get('unmatched')
  @RequirePermissions('payments.reconcile')
  unmatched(@CurrentUser() user: AuthUser) {
    return this.paymentsService.unmatched(user);
  }

  @Post(':id/verify')
  @RequirePermissions('payments.verify')
  verify(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.paymentsService.verify(user, id);
  }

  @Post(':id/reject')
  @RequirePermissions('payments.reject')
  reject(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: RejectPaymentDto,
  ) {
    return this.paymentsService.reject(user, id, dto.reason);
  }

  @Post(':id/match')
  @RequirePermissions('payments.reconcile')
  match(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: MatchPaymentDto,
  ) {
    return this.paymentsService.match(user, id, dto);
  }

  @Post(':id/refund')
  @RequirePermissions('payments.refund')
  refund(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.paymentsService.refund(user, id);
  }
}
