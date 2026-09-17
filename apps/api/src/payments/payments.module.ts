import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Redis } from 'ioredis';
import type { Env } from '../config/env';
import { REDIS } from '../redis/redis.module';
import { MockPaymentProvider } from './mock.provider';
import { OrderPaymentsService } from './order-payments.service';
import { PaymentProvider } from './payment-provider';
import { QPayProvider } from './qpay.provider';

/** API ба worker хоёулаа ашиглана. Провайдерыг PAYMENT_PROVIDER env-ээр сонгоно (production-д зөвхөн qpay). */
@Global()
@Module({
  providers: [
    {
      provide: PaymentProvider,
      inject: [ConfigService, REDIS],
      useFactory: (config: ConfigService<Env, true>, redis: Redis): PaymentProvider =>
        config.get('PAYMENT_PROVIDER', { infer: true }) === 'qpay' ? new QPayProvider(config) : new MockPaymentProvider(redis),
    },
    OrderPaymentsService,
  ],
  exports: [PaymentProvider, OrderPaymentsService],
})
export class PaymentsModule {}
