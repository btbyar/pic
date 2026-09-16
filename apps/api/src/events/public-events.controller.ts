import { Controller, Get, Param, Query, Req } from '@nestjs/common';
import { z } from 'zod';
import { type AuthedRequest, Public } from '../auth/decorators';
import { ZodPipe } from '../common/zod.pipe';
import { EventsService } from './events.service';

const listQuerySchema = z.object({
  cursor: z.uuid().optional(),
  q: z.string().trim().min(1).max(100).optional(),
});

const slugSchema = z.string().regex(/^[a-z0-9-]{1,80}$/);

@Public()
@Controller('events')
export class PublicEventsController {
  constructor(private readonly events: EventsService) {}

  @Get()
  list(@Query(new ZodPipe(listQuerySchema)) query: z.output<typeof listQuerySchema>) {
    return this.events.listPublic(query);
  }

  /** `?t=` — нууц (UNLISTED) эвэнтийн холбоосны токен */
  @Get(':slug')
  get(
    @Param('slug', new ZodPipe(slugSchema)) slug: string,
    @Query('t') accessToken: string | undefined,
    @Req() req: AuthedRequest,
  ) {
    return this.events.getPublic(slug, { accessToken, auth: req.auth });
  }
}
