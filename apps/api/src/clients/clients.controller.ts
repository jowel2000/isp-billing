import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import type { AuthUser } from '../auth/types/auth-user';
import { ClientsService } from './clients.service';
import { CreateClientDto } from './dto/create-client.dto';
import { ListClientsDto } from './dto/list-clients.dto';
import { RevealSensitiveDto } from './dto/reveal.dto';
import { UpdateClientDto } from './dto/update-client.dto';

@Controller('clients')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ClientsController {
  constructor(private readonly clientsService: ClientsService) {}

  @Get()
  @RequirePermissions('clients.view')
  list(@CurrentUser() user: AuthUser, @Query() query: ListClientsDto) {
    return this.clientsService.list(user, query);
  }

  @Post()
  @RequirePermissions('clients.create')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateClientDto) {
    return this.clientsService.create(user, dto);
  }

  @Get(':id')
  @RequirePermissions('clients.view')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.clientsService.get(user, id);
  }

  @Patch(':id')
  @RequirePermissions('clients.edit')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateClientDto,
  ) {
    return this.clientsService.update(user, id, dto);
  }

  @Delete(':id')
  @RequirePermissions('clients.delete')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.clientsService.remove(user, id);
  }

  @Post(':id/reveal')
  @RequirePermissions('clients.view')
  reveal(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: RevealSensitiveDto,
  ) {
    return this.clientsService.reveal(user, id, dto.field);
  }

  @Get(':id/login-history')
  @RequirePermissions('clients.view')
  loginHistory(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.clientsService.loginHistory(user, id);
  }
}
