import {
  All,
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { type CreateOrderInput, createOrderSchema, type OrderQuoteInput, orderQuoteSchema, orderTokenSchema } from '@pic/shared';
import type { Response } from 'express';
import { z } from 'zod';
import { type AuthedRequest, Public } from '../auth/decorators';
import { hashIp } from '../common/crypto';
import { RateLimiter } from '../common/rate-limiter';
import { clientIp, userAgent } from '../common/request-meta';
import { ZodPipe } from '../common/zod.pipe';
import type { Env } from '../config/env';
import { OrderPaymentsService } from '../payments/order-payments.service';
import { PaymentUnavailableError } from '../payments/payment-provider';
import { OrdersService } from './orders.service';

const slugSchema = z.string().regex(/^[a-z0-9-]{1,80}$/);
/**
 * Захиалгын нууц токен header-ээр ирнэ (URL-д биш): reverse proxy/access log-д үлдэхгүй.
 * Web нь токенийг URL-ийн #fragment-ээс уншдаг — fragment сервер рүү огт илгээгддэггүй.
 */
const TOKEN_HEADER = 'x-order-token';

function orderToken(value: string | undefined): string {
  const parsed = orderTokenSchema.safeParse(value);
  if (!parsed.success) throw new BadRequestException({ statusCode: 400, code: 'order_token_required' });
  return parsed.data;
}

@Public()
@Controller()
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Post('events/:slug/orders/quote')
  @HttpCode(200)
  quote(
    @Param('slug', new ZodPipe(slugSchema)) slug: string,
    @Body(new ZodPipe(orderQuoteSchema)) body: OrderQuoteInput,
    @Req() req: AuthedRequest,
  ) {
    return this.orders.quote(slug, body, req.auth, clientIp(req));
  }

  @Post('events/:slug/orders')
  create(
    @Param('slug', new ZodPipe(slugSchema)) slug: string,
    @Body(new ZodPipe(createOrderSchema)) body: CreateOrderInput,
    @Req() req: AuthedRequest,
  ) {
    return this.orders.create(slug, body, req.auth, clientIp(req));
  }

  @Get('orders/:id')
  get(
    @Param('id', ParseUUIDPipe) id: string,
    @Headers(TOKEN_HEADER) token: string | undefined,
    @Req() req: AuthedRequest,
  ) {
    return this.orders.get(id, orderToken(token), clientIp(req));
  }

  @Post('orders/:id/items/:itemId/download')
  @HttpCode(200)
  download(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Headers(TOKEN_HEADER) token: string | undefined,
    @Req() req: AuthedRequest,
  ) {
    return this.orders.downloadUrl(id, itemId, orderToken(token), { ip: clientIp(req), userAgent: userAgent(req) });
  }

  /** Зөвхөн хөгжүүлэлт (PAYMENT_PROVIDER=mock): QR уншуулахын оронд "төлсөн" болгоно */
  @Post('orders/:id/mock-pay')
  @HttpCode(200)
  mockPay(@Param('id', ParseUUIDPipe) id: string, @Headers(TOKEN_HEADER) token: string | undefined) {
    return this.orders.simulatePayment(id, orderToken(token));
  }
}

const CALLBACK_BY_IP = { name: 'payment:callback', limit: 120, windowSec: 60 };

/**
 * QPay төлбөр орсны дараа энэ хаягийг дуудна (?payment=<манай Payment ID>).
 * Callback-ийн агуулгад итгэхгүй — зөвхөн "шалга" гэсэн дохио. Төлөгдсөн эсэхийг QPay API-аас асууна.
 */
@Public()
@Controller('payments')
export class PaymentsController {
  private readonly ipSecret: string;

  constructor(
    private readonly payments: OrderPaymentsService,
    private readonly rateLimiter: RateLimiter,
    private readonly ordersRepo: OrdersService,
    config: ConfigService<Env, true>,
  ) {
    this.ipSecret = config.get('IP_HASH_SECRET', { infer: true });
  }

  @All('qpay/callback')
  async qpayCallback(@Query('payment') paymentId: string | undefined, @Req() req: AuthedRequest, @Res() res: Response) {
    await this.rateLimiter.consume(CALLBACK_BY_IP, hashIp(clientIp(req), this.ipSecret));
    const parsed = z.uuid().safeParse(paymentId);
    if (parsed.success) {
      const orderId = await this.ordersRepo.orderIdForPayment(parsed.data);
      if (orderId) {
        try {
          await this.payments.reconcile(orderId);
        } catch (err) {
          // QPay дахин callback илгээхгүй байж болно — worker хугацаа дуусахаас өмнө, хэрэглэгчийн polling шалгана
          if (!(err instanceof PaymentUnavailableError)) throw err;
        }
      }
    }
    // QPay-д үргэлж амжилттай хариу (буруу ID-г ч задруулахгүй)
    res.status(200).type('text/plain').send('SUCCESS');
  }
}
