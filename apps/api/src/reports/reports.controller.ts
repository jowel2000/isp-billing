import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { IsDateString, IsOptional } from 'class-validator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import type { AuthUser } from '../auth/types/auth-user';
import { HistoryQueryDto } from './dto/history-query.dto';
import { ReportsService } from './reports.service';

class DateRangeDto {
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}

@Controller('reports')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('collection')
  @RequirePermissions('reports.view')
  collection(@CurrentUser() user: AuthUser, @Query() range: DateRangeDto) {
    return this.reportsService.collection(user.tenantId, range);
  }

  @Get('monthly-collection')
  @RequirePermissions('reports.view')
  monthlyCollection(@CurrentUser() user: AuthUser) {
    return this.reportsService.monthlyCollection(user.tenantId);
  }

  @Get('due')
  @RequirePermissions('reports.view')
  due(@CurrentUser() user: AuthUser) {
    return this.reportsService.due(user.tenantId);
  }

  @Get('vat')
  @RequirePermissions('reports.financial')
  vat(@CurrentUser() user: AuthUser, @Query() range: DateRangeDto) {
    return this.reportsService.vat(user.tenantId, range);
  }

  @Get('profit')
  @RequirePermissions('reports.profit')
  profit(@CurrentUser() user: AuthUser, @Query() range: DateRangeDto) {
    return this.reportsService.profit(user.tenantId, range);
  }

  @Get('recharge-jobs')
  @RequirePermissions('reports.recharge')
  rechargeJobs(@CurrentUser() user: AuthUser, @Query() query: HistoryQueryDto) {
    return this.reportsService.rechargeJobs(user.tenantId, query);
  }

  @Get('ledger')
  @RequirePermissions('reports.ledger')
  ledger(@CurrentUser() user: AuthUser, @Query() query: HistoryQueryDto) {
    return this.reportsService.ledger(user.tenantId, query);
  }
}
