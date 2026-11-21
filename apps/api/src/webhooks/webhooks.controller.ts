import {
  Body,
  Controller,
  Get,
  Headers,
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
import { MatchSmsDto } from './dto/match-sms.dto';
import { SmsListDto } from './dto/sms-list.dto';
import { SmsWebhookDto } from './dto/sms-webhook.dto';
import { WebhooksService } from './webhooks.service';

@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly webhooksService: WebhooksService) {}

  @Post('sms')
  inbound(
    @Headers('x-sms-secret') secret: string | undefined,
    @Body() dto: SmsWebhookDto,
  ) {
    this.webhooksService.assertSecret(secret);
    return this.webhooksService.ingest(dto);
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Get('sms')
  @RequirePermissions('payments.reconcile')
  list(@CurrentUser() user: AuthUser, @Query() query: SmsListDto) {
    return this.webhooksService.list(user.tenantId, query);
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Post('sms/:id/match')
  @RequirePermissions('payments.reconcile')
  match(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: MatchSmsDto,
  ) {
    return this.webhooksService.matchSms(user, id, dto.clientId);
  }
}
