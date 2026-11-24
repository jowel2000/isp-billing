import { Module } from '@nestjs/common';
import { SyncModule } from '../sync/sync.module';
import { OtpStore } from './otp.store';
import { OtpWindowService } from './otp-window.service';
import { UpstreamOtpController } from './upstream-otp.controller';
import { UpstreamController } from './upstream.controller';
import { UpstreamService } from './upstream.service';
import { UpstreamSyncService } from './upstream-sync.service';

@Module({
  imports: [SyncModule],
  controllers: [UpstreamController, UpstreamOtpController],
  providers: [UpstreamService, UpstreamSyncService, OtpStore, OtpWindowService],
  exports: [OtpStore, OtpWindowService, UpstreamSyncService],
})
export class UpstreamModule {}
