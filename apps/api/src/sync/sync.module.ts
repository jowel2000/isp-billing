import { Module } from '@nestjs/common';
import { SyncController } from './sync.controller';
import { SyncStatusService } from './sync-status.service';

@Module({
  controllers: [SyncController],
  providers: [SyncStatusService],
  exports: [SyncStatusService],
})
export class SyncModule {}
