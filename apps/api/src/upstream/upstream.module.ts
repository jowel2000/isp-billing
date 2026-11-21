import { Module } from '@nestjs/common';
import { OtpStore } from './otp.store';
import { UpstreamOtpController } from './upstream-otp.controller';
import { UpstreamController } from './upstream.controller';
import { UpstreamService } from './upstream.service';

@Module({
  controllers: [UpstreamController, UpstreamOtpController],
  providers: [UpstreamService, OtpStore],
  exports: [OtpStore],
})
export class UpstreamModule {}
