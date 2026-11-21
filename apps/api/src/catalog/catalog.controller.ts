import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import type { AuthUser } from '../auth/types/auth-user';
import { CatalogService } from './catalog.service';
import {
  CreateAreaDto,
  CreatePackageDto,
  UpdateAreaDto,
  UpdatePackageDto,
} from './dto/catalog.dto';

@Controller('areas')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AreasController {
  constructor(private readonly catalog: CatalogService) {}

  @Get()
  @RequirePermissions('areas.view')
  list(@CurrentUser() user: AuthUser) {
    return this.catalog.listAreas(user.tenantId);
  }

  @Post()
  @RequirePermissions('areas.edit')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateAreaDto) {
    return this.catalog.createArea(user, dto);
  }

  @Patch(':id')
  @RequirePermissions('areas.edit')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateAreaDto,
  ) {
    return this.catalog.updateArea(user, id, dto);
  }
}

@Controller('packages')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PackagesController {
  constructor(private readonly catalog: CatalogService) {}

  @Get()
  @RequirePermissions('packages.view')
  list(@CurrentUser() user: AuthUser) {
    return this.catalog.listPackages(user);
  }

  @Post()
  @RequirePermissions('packages.edit')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreatePackageDto) {
    return this.catalog.createPackage(user, dto);
  }

  @Patch(':id')
  @RequirePermissions('packages.edit')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdatePackageDto,
  ) {
    return this.catalog.updatePackage(user, id, dto);
  }
}
