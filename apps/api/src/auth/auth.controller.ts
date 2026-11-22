import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { CurrentUser } from './decorators/current-user.decorator';
import {
  ForgotRequestDto,
  ForgotResetDto,
  ForgotVerifyDto,
} from './dto/forgot-password.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { AuthService } from './auth.service';
import type { AuthUser } from './types/auth-user';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  login(@Body() dto: LoginDto, @Req() request: Request) {
    return this.authService.login(dto.loginId || dto.mobile || '', dto.password, {
      ip: request.ip,
      userAgent: request.headers['user-agent'],
    });
  }

  @Post('refresh')
  refresh(@Body() dto: RefreshDto, @Req() request: Request) {
    return this.authService.refresh(dto.refreshToken, {
      ip: request.ip,
      userAgent: request.headers['user-agent'],
    });
  }

  @Post('logout')
  logout(@Body() dto: RefreshDto) {
    return this.authService.logout(dto.refreshToken);
  }

  // ------------------------------------------------- Forgot password flow

  @Post('forgot-password/request')
  forgotRequest(@Body() dto: ForgotRequestDto) {
    return this.authService.requestPasswordReset(dto.identifier);
  }

  @Post('forgot-password/verify')
  forgotVerify(@Body() dto: ForgotVerifyDto) {
    return this.authService.verifyPasswordReset(dto.identifier, dto.otp);
  }

  @Post('forgot-password/reset')
  forgotReset(@Body() dto: ForgotResetDto) {
    return this.authService.resetPassword(dto.resetToken, dto.newPassword, dto.loginId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return user;
  }
}
