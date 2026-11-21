import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import type { AuthUser } from '../auth/types/auth-user';
import { LogQueryDto } from './dto/log-query.dto';
import { LogsService } from './logs.service';

@Controller('logs')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class LogsController {
  constructor(private readonly logsService: LogsService) {}

  @Get('client-logins')
  @RequirePermissions('logs.client_login')
  clientLogins(@CurrentUser() user: AuthUser, @Query() query: LogQueryDto) {
    return this.logsService.clientLogins(user, query);
  }

  @Get('user-logins')
  @RequirePermissions('logs.user_login')
  userLogins(@CurrentUser() user: AuthUser, @Query() query: LogQueryDto) {
    return this.logsService.userLogins(user, query);
  }

  @Get('audit')
  @RequirePermissions('logs.audit')
  audit(@CurrentUser() user: AuthUser, @Query() query: LogQueryDto) {
    return this.logsService.audit(user, query);
  }
}
