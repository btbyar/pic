import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, Req } from '@nestjs/common';
import {
  type CreateRefundInput,
  createRefundSchema,
  type MarkPayoutPaidInput,
  markPayoutPaidSchema,
  ORDER_STATUSES,
  payoutPeriod,
  periodSchema,
} from '@pic/shared';
import { z } from 'zod';
import { AuthService } from '../auth/auth.service';
import { type AuthContext, type AuthedRequest, CurrentUser, Roles } from '../auth/decorators';
import { clientIp } from '../common/request-meta';
import { ZodPipe } from '../common/zod.pipe';
import { FinanceService } from './finance.service';

const ordersQuerySchema = z.object({
  status: z.enum(ORDER_STATUSES).optional(),
  q: z.string().trim().max(100).optional(),
  cursor: z.uuid().optional(),
});
const payoutsQuerySchema = z.object({ period: periodSchema.optional() });

@Roles('ADMIN')
@Controller('admin')
export class AdminFinanceController {
  constructor(
    private readonly finance: FinanceService,
    private readonly auth: AuthService,
  ) {}

  @Get('orders')
  listOrders(@Query(new ZodPipe(ordersQuerySchema)) query: z.output<typeof ordersQuerySchema>) {
    return this.finance.listOrders(query);
  }

  @Get('orders/:id')
  getOrder(@Param('id', ParseUUIDPipe) id: string) {
    return this.finance.getOrder(id);
  }

  @Post('orders/:id/refunds')
  async refund(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(createRefundSchema)) body: CreateRefundInput,
    @CurrentUser() admin: AuthContext,
    @Req() req: AuthedRequest,
  ) {
    await this.auth.requireStepUpMfa(admin, body.totpCode);
    return this.finance.refund(admin, id, body, clientIp(req));
  }

  @Get('payouts')
  payouts(@Query(new ZodPipe(payoutsQuerySchema)) query: z.output<typeof payoutsQuerySchema>) {
    return this.finance.payouts(query.period ?? payoutPeriod(new Date()));
  }

  @Post('payouts/mark-paid')
  @HttpCode(200)
  async markPaid(
    @Body(new ZodPipe(markPayoutPaidSchema)) body: MarkPayoutPaidInput,
    @CurrentUser() admin: AuthContext,
    @Req() req: AuthedRequest,
  ) {
    await this.auth.requireStepUpMfa(admin, body.totpCode);
    return this.finance.markPaid(admin, body, clientIp(req));
  }
}
