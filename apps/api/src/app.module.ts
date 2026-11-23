import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { InvoicesModule } from './billing/invoices.module';
import { CatalogModule } from './catalog/catalog.module';
import { ClientsModule } from './clients/clients.module';
import { HealthModule } from './health/health.module';
import { LogsModule } from './logs/logs.module';
import { PaymentsModule } from './payments/payments.module';
import { PrismaModule } from './prisma/prisma.module';
import { ReportsModule } from './reports/reports.module';
import { SettingsModule } from './settings/settings.module';
import { SyncModule } from './sync/sync.module';
import { UpstreamModule } from './upstream/upstream.module';
import { UsersModule } from './users/users.module';
import { WebhooksModule } from './webhooks/webhooks.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['../../.env', '.env'],
    }),
    PrismaModule,
    AuthModule,
    UsersModule,
    ClientsModule,
    CatalogModule,
    InvoicesModule,
    PaymentsModule,
    ReportsModule,
    LogsModule,
    SettingsModule,
    UpstreamModule,
    SyncModule,
    WebhooksModule,
    HealthModule,
  ],
})
export class AppModule {}
