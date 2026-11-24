import { Module } from '@nestjs/common';
import { PaymentsModule } from '../payments/payments.module';
import { UpstreamModule } from '../upstream/upstream.module';
import { SmsAiClassifierService } from './sms-ai-classifier.service';
import { SmsParserService } from './sms-parser.service';
import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';

@Module({
  imports: [PaymentsModule, UpstreamModule],
  controllers: [WebhooksController],
  providers: [WebhooksService, SmsParserService, SmsAiClassifierService],
})
export class WebhooksModule {}
