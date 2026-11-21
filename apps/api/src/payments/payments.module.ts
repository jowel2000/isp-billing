import { Module } from '@nestjs/common';
import { InvoicesModule } from '../billing/invoices.module';
import { PaymentsController } from './payments.controller';
import { PortalController } from './portal.controller';
import { PaymentsService } from './payments.service';

@Module({
  imports: [InvoicesModule],
  controllers: [PaymentsController, PortalController],
  providers: [PaymentsService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
