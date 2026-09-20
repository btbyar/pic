import { Controller, Get, Param, Query, Req } from '@nestjs/common';
import { z } from 'zod';
import { type AuthedRequest, Public } from '../auth/decorators';
import { ZodPipe } from '../common/zod.pipe';
import { EventsService } from './events.service';

const photosQuerySchema = z.object({
  cursor: z.uuid().optional(),
  t: z.string().max(100).optional(),
});

const slugSchema = z.string().regex(/^[a-z0-9-]{1,80}$/);
const searchQuerySchema = z.object({ q: z.string().trim().min(2).max(100) });

/**
 * Нийтийн эвэнтийн нэгдсэн жагсаалт зориуд байхгүй (2026-09-18, хэрэглэгчийн шийдвэр): оролцогч эвэнтээ
 * зурагчны профайлаас эсвэл шууд холбоос/QR-аар олно.
 */
@Public()
@Controller('events')
export class PublicEventsController {
  constructor(private readonly events: EventsService) {}

  /** Эвэнтийн нэрээр хайх. `:slug`-аас өмнө байх ёстой (эс тэгвээс "search" нь slug болно). */
  @Get('search')
  search(@Query(new ZodPipe(searchQuerySchema)) query: z.output<typeof searchQuerySchema>) {
    return this.events.searchPublic(query.q);
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

  @Get(':slug/photos')
  photos(
    @Param('slug', new ZodPipe(slugSchema)) slug: string,
    @Query(new ZodPipe(photosQuerySchema)) query: z.output<typeof photosQuerySchema>,
    @Req() req: AuthedRequest,
  ) {
    return this.events.listPublicPhotos(slug, { accessToken: query.t, auth: req.auth }, query.cursor);
  }
}
