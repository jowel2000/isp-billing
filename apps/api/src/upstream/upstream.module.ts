import { Module } from '@nestjs/common';
import { OtpStore } from './otp.store';
import { UpstreamOtpController } from './upstream-otp.controller';
import { UpstreamController } from './upstream.controller';
import { UpstreamService } from './upstream.service';
import { UpstreamSyncService } from './upstream-sync.service';

@Module({
  controllers: [UpstreamController, UpstreamOtpController],
  providers: [UpstreamService, UpstreamSyncService, OtpStore],
  exports: [OtpStore],
})
export class UpstreamModule {}
