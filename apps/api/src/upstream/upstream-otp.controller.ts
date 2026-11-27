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
import { createHash } from 'node:crypto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import type { AuthUser } from '../auth/types/auth-user';
import { decryptString, encryptString } from '../common/crypto';
import { PrismaService } from '../prisma/prisma.service';
import { extractOtpCode } from '../webhooks/sms-parser.service';
import { OtpStore } from './otp.store';
import { OtpWindowService } from './otp-window.service';
import { UpstreamSyncService } from './upstream-sync.service';

const KEY = 'default';

@Controller('upstream/otp')
export class UpstreamOtpController {
  constructor(
    private readonly store: OtpStore,
    private readonly prisma: PrismaService,
    private readonly otpWindows: OtpWindowService,
    private readonly upstreamSync: UpstreamSyncService,
  ) {}

  @Post('inbound')
  async inbound(
    @Headers('x-sms-secret') secret: string | undefined,
    @Body() body: { message?: string; otp?: string },
  ) {
    const expected = process.env.SMS_FORWARD_SECRET;
    if (!expected || secret !== expected) {
      throw new UnauthorizedException('Invalid SMS forward secret');
    }

    const source = body.otp ?? body.message ?? '';
    const extraction = extractOtpCode(source);
    if (!extraction.code) {
      throw new BadRequestException(
        extraction.reason ?? 'No OTP found in the message',
      );
    }

    const tenant = await this.prisma.tenant.findFirst({
      orderBy: { createdAt: 'asc' },
    });
    if (!tenant) throw new BadRequestException('No tenant configured');

    await this.otpWindows.recoverStale(tenant.id);
    const window = await this.prisma.otpWindow.findFirst({
      where: { tenantId: tenant.id, status: 'pending' },
      orderBy: { requestedAt: 'desc' },
    });
    if (!window) {
      throw new BadRequestException('No active OTP window — request a new OTP');
    }

    const now = Date.now();
    if (now < window.requestedAt.getTime()) {
      throw new BadRequestException('OTP arrived before the request window');
    }
    if (now >= window.expiresAt.getTime()) {
      await this.otpWindows.expire(window.id, 'OTP_EXPIRED');
      throw new BadRequestException('OTP window has expired');
    }

    const claimed = await this.otpWindows.claim(window.id);
    if (!claimed) {
      throw new BadRequestException('OTP window is already being verified');
    }

    await this.prisma.otpRequest.create({
      data: {
        tenantId: tenant.id,
        context: 'triangle_login',
        status: 'pending',
        requestedAt: window.requestedAt,
        expiresAt: window.expiresAt,
        codeHash: createHash('sha256').update(extraction.code).digest('hex'),
        codeEnc: encryptString(extraction.code),
        otpWindowId: window.id,
      },
    });

    this.store.set(KEY, extraction.code);
    // Browser-login mode: the Playwright worker reads the stored OTP itself.
    const loginMode = (process.env.TRIANGLE_LOGIN_MODE || 'http').toLowerCase();
    if (loginMode !== 'browser') {
      void this.upstreamSync
        .completeLoginAndSync(tenant.id, window.id)
        .catch(() => undefined);
    }

    return {
      accepted: true,
      receivedAt: new Date().toISOString(),
      windowId: window.id,
      expiresAt: window.expiresAt.toISOString(),
    };
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Get('status')
  @RequirePermissions('upstream.manage')
  status(@CurrentUser() _user: AuthUser) {
    return this.store.status(KEY);
  }

  /**
   * Latest pending OTP forwarded for the upstream (Triangle) login.
   * Used by the automation worker / diagnostics. Authorized managers only.
   */
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Get('latest')
  @RequirePermissions('upstream.manage')
  async latest(@CurrentUser() user: AuthUser) {
    const record = await this.prisma.otpRequest.findFirst({
      where: {
        tenantId: user.tenantId,
        context: 'triangle_login',
        status: 'pending',
        expiresAt: { gt: new Date() },
      },
      orderBy: { requestedAt: 'desc' },
      select: { id: true, codeEnc: true, expiresAt: true, requestedAt: true },
    });

    if (!record || !record.codeEnc) {
      return { hasOtp: false, otp: null, expiresAt: null };
    }

    return {
      hasOtp: true,
      otp: decryptString(record.codeEnc),
      expiresAt: record.expiresAt,
      receivedAt: record.requestedAt,
      id: record.id,
    };
  }
}
