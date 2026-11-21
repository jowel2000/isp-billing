import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Post,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import type { AuthUser } from '../auth/types/auth-user';
import { OtpStore } from './otp.store';

const KEY = 'default';

@Controller('upstream/otp')
export class UpstreamOtpController {
  constructor(private readonly store: OtpStore) {}

  @Post('inbound')
  inbound(
    @Headers('x-sms-secret') secret: string | undefined,
    @Body() body: { message?: string; otp?: string },
  ) {
    const expected = process.env.SMS_FORWARD_SECRET;
    if (!expected || secret !== expected) {
      throw new UnauthorizedException('Invalid SMS forward secret');
    }

    const source = body.otp ?? body.message ?? '';
    const match = source.match(/\b(\d{6})\b/);
    if (!match) throw new BadRequestException('No 6-digit OTP found in the message');

    this.store.set(KEY, match[1]);
    return { accepted: true, receivedAt: new Date().toISOString() };
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Get('status')
  @RequirePermissions('upstream.manage')
  status(@CurrentUser() _user: AuthUser) {
    return this.store.status(KEY);
  }
}
