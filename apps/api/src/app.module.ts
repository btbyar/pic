import { Module } from '@nestjs/common';
import { AdminModule } from './admin/admin.module';
import { AuthModule } from './auth/auth.module';
import { AppConfigModule } from './config/config.module';
import { EventsModule } from './events/events.module';
import { HealthModule } from './health/health.module';
import { MailModule } from './mail/mailer';
import { MlModule } from './ml/ml-client';
import { OrdersModule } from './orders/orders.module';
import { PaymentsModule } from './payments/payments.module';
import { PrismaModule } from './prisma/prisma.module';
import { QueueModule } from './queue/queue.module';
import { RedisModule } from './redis/redis.module';
import { SearchModule } from './search/search.module';
import { SettingsModule } from './settings/settings.service';
import { StorageModule } from './storage/storage.module';
import { UploadsModule } from './uploads/uploads.module';

@Module({
  imports: [
    AppConfigModule,
    PrismaModule,
    RedisModule,
    StorageModule,
    QueueModule,
    SettingsModule,
    MlModule,
    MailModule,
    PaymentsModule,
    AuthModule,
    HealthModule,
    AdminModule,
    EventsModule,
    UploadsModule,
    SearchModule,
    OrdersModule,
  ],
})
export class AppModule {}
