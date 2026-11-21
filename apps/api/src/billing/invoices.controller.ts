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
  CreateInvoiceDto,
  ListInvoicesDto,
  WaiveInvoiceDto,
} from './dto/invoice.dto';
import { InvoicesService } from './invoices.service';

@Controller('invoices')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class InvoicesController {
  constructor(private readonly invoicesService: InvoicesService) {}

  @Get()
  @RequirePermissions('invoices.view')
  list(@CurrentUser() user: AuthUser, @Query() query: ListInvoicesDto) {
    return this.invoicesService.list(user, query);
  }

  @Post()
  @RequirePermissions('invoices.create')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateInvoiceDto) {
    return this.invoicesService.create(user, dto);
  }

  @Get('summary')
  @RequirePermissions('invoices.view')
  summary(@CurrentUser() user: AuthUser) {
    return this.invoicesService.summary(user.tenantId);
  }

  @Get(':id')
  @RequirePermissions('invoices.view')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.invoicesService.get(user, id);
  }

  @Post(':id/waive')
  @RequirePermissions('invoices.waive')
  waive(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: WaiveInvoiceDto,
  ) {
    return this.invoicesService.waive(user, id, dto);
  }

  @Post(':id/send')
  @RequirePermissions('invoices.send')
  send(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.invoicesService.send(user, id);
  }
}
