import { Inject, Injectable } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { REDIS } from '../redis/redis.module';
import { type CreateInvoiceInput, type Invoice, type InvoiceCheck, PaymentProvider } from './payment-provider';

const TTL_SEC = 2 * 24 * 3600;
const key = (invoiceId: string) => `mockpay:${invoiceId}`;

interface MockInvoice {
  amount: number;
  paid: boolean;
}

/**
 * Хөгжүүлэлтийн төлбөр: мөнгө шилжихгүй. Төлөвийг Redis-д хадгалдаг тул API ба worker хоёр процесс ижил харна.
 * "Төлсөн" болгох нь зөвхөн `/payments/mock/:paymentId/pay` (production-д env шалгалтаар хаалттай).
 */
@Injectable()
export class MockPaymentProvider extends PaymentProvider {
  readonly name = 'MOCK' as const;

  constructor(@Inject(REDIS) private readonly redis: Redis) {
    super();
  }

  async createInvoice(input: CreateInvoiceInput): Promise<Invoice> {
    const invoiceId = `MOCK-${input.paymentId}`;
    await this.redis.set(key(invoiceId), JSON.stringify({ amount: input.amount, paid: false } satisfies MockInvoice), 'EX', TTL_SEC);
    return {
      invoiceId,
      qrText: `PIC-MOCK:${invoiceId}:${input.amount}`,
      deeplinks: [],
      shortUrl: null,
      raw: { mock: true },
    };
  }

  async checkInvoice(invoiceId: string): Promise<InvoiceCheck> {
    const invoice = await this.read(invoiceId);
    const paid = invoice?.paid ?? false;
    return {
      paid,
      paidAmount: paid ? invoice!.amount : 0,
      providerPaymentId: paid ? `${invoiceId}-PAID` : null,
      raw: { mock: true, paid },
    };
  }

  async cancelInvoice(invoiceId: string): Promise<void> {
    await this.redis.del(key(invoiceId));
  }

  /** Туршилтаар "төлөх". Нэхэмжлэх байхгүй (цуцлагдсан/хугацаа дууссан) бол false. */
  async simulatePayment(invoiceId: string): Promise<boolean> {
    const invoice = await this.read(invoiceId);
    if (!invoice) return false;
    await this.redis.set(key(invoiceId), JSON.stringify({ ...invoice, paid: true }), 'EX', TTL_SEC);
    return true;
  }

  private async read(invoiceId: string): Promise<MockInvoice | null> {
    const raw = await this.redis.get(key(invoiceId));
    return raw ? (JSON.parse(raw) as MockInvoice) : null;
  }
}
