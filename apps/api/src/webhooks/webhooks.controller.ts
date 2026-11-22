import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { Request } from 'express';
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
  async inbound(
    @Headers('x-sms-secret') secret: string | undefined,
    @Body() dto: SmsWebhookDto,
    @Req() request: Request,
  ) {
    // Build the attempt record once; the secret is never stored — only its hash.
    const rawBody = JSON.stringify(dto ?? {});
    const attempt = {
      ip: request.ip ?? null,
      secretHash: secret
        ? createHash('sha256').update(secret).digest('hex')
        : null,
      bodyHash: createHash('sha256').update(rawBody).digest('hex'),
      bodySnippet: rawBody.slice(0, 300),
    };

    try {
      this.webhooksService.assertSecret(secret);
      const result = await this.webhooksService.ingest(dto);
      await this.webhooksService.logAttempt({
        ...attempt,
        statusCode: 200,
        success: true,
        reason: null,
      });
      return result;
    } catch (error) {
      const statusCode = (error as { status?: number })?.status ?? 500;
      await this.webhooksService.logAttempt({
        ...attempt,
        statusCode,
        success: false,
        reason: (error as Error).message,
      });
      throw error;
    }
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
