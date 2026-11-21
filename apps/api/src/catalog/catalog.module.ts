import { Module } from '@nestjs/common';
import { AreasController, PackagesController } from './catalog.controller';
import { CatalogService } from './catalog.service';

@Module({
  controllers: [AreasController, PackagesController],
  providers: [CatalogService],
  exports: [CatalogService],
})
export class CatalogModule {}
