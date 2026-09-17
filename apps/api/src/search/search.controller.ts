import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UnsupportedMediaTypeException,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { searchResultsQuerySchema } from '@pic/shared';
import { z } from 'zod';
import { type AuthedRequest, Public } from '../auth/decorators';
import { clientIp } from '../common/request-meta';
import { ZodPipe } from '../common/zod.pipe';
import { SearchService } from './search.service';

const SELFIE_MAX_BYTES = 8 * 1024 * 1024;
const SELFIE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

const slugSchema = z.string().regex(/^[a-z0-9-]{1,80}$/);

// multipart form-ийн талбарууд текст хэлбэрээр ирнэ
const searchBodySchema = z.object({
  consent: z.literal('true', { error: 'consent_required' }),
  t: z.string().max(100).optional(),
});

/** Multer-ийн memoryStorage-ийн файл. Диск рүү хэзээ ч бичихгүй (Nest-ийн FileInterceptor default). */
interface InMemoryFile {
  buffer: Buffer;
  mimetype: string;
  size: number;
}

@Public()
@Controller()
export class SearchController {
  constructor(private readonly search: SearchService) {}

  @Post('events/:slug/search')
  @HttpCode(200)
  @UseInterceptors(
    FileInterceptor('selfie', {
      limits: { fileSize: SELFIE_MAX_BYTES, files: 1, fields: 10 },
      fileFilter: (_req, file, cb) =>
        SELFIE_TYPES.has(file.mimetype)
          ? cb(null, true)
          : cb(new UnsupportedMediaTypeException({ statusCode: 415, code: 'invalid_image' }), false),
    }),
  )
  searchBySelfie(
    @Param('slug', new ZodPipe(slugSchema)) slug: string,
    @UploadedFile() selfie: InMemoryFile | undefined,
    @Body() rawBody: unknown,
    @Req() req: AuthedRequest,
  ) {
    const parsed = searchBodySchema.safeParse(rawBody);
    if (!parsed.success) {
      const consentMissing = parsed.error.issues.some((i) => i.path[0] === 'consent');
      throw new BadRequestException({
        statusCode: 400,
        code: consentMissing ? 'consent_required' : 'validation_failed',
        issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
    }
    if (!selfie) throw new BadRequestException({ statusCode: 400, code: 'selfie_required' });
    const body = parsed.data;
    return this.search.searchBySelfie(slug, { accessToken: body.t, auth: req.auth }, selfie.buffer, clientIp(req));
  }

  @Get('events/:slug/search/:sessionId')
  results(
    @Param('slug', new ZodPipe(slugSchema)) slug: string,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Query(new ZodPipe(searchResultsQuerySchema)) query: z.output<typeof searchResultsQuerySchema>,
    @Req() req: AuthedRequest,
  ) {
    return this.search.getResults(slug, { accessToken: query.t, auth: req.auth }, sessionId, clientIp(req));
  }

  /** Хэрэглэгч "хайлтын өгөгдлөө устгах" дарахад. Session ID-г мэдэх хүн л устгана (таамаглах боломжгүй UUIDv4). */
  @Delete('search-sessions/:sessionId')
  @HttpCode(204)
  async remove(@Param('sessionId', ParseUUIDPipe) sessionId: string) {
    await this.search.deleteSession(sessionId);
  }
}
