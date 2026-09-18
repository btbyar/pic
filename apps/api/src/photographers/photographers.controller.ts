import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
  UnsupportedMediaTypeException,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
  HttpCode,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AVATAR_MAX_BYTES, type UpdateProfileInput, updateProfileSchema, PROFILE_SLUG_RE } from '@pic/shared';
import { z } from 'zod';
import { type AuthContext, CurrentUser, Public, Roles } from '../auth/decorators';
import { ZodPipe } from '../common/zod.pipe';
import { PhotographersService } from './photographers.service';

const AVATAR_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

@Roles('PHOTOGRAPHER')
@Controller('photographer/profile')
export class PhotographerProfileController {
  constructor(private readonly photographers: PhotographersService) {}

  @Get()
  get(@CurrentUser() user: AuthContext) {
    return this.photographers.getMine(user);
  }

  @Put()
  update(@CurrentUser() user: AuthContext, @Body(new ZodPipe(updateProfileSchema)) body: UpdateProfileInput) {
    return this.photographers.updateMine(user, body);
  }

  @Post('avatar')
  @HttpCode(200)
  @UseInterceptors(
    FileInterceptor('avatar', {
      limits: { fileSize: AVATAR_MAX_BYTES, files: 1 },
      fileFilter: (_req, file, cb) =>
        AVATAR_TYPES.has(file.mimetype)
          ? cb(null, true)
          : cb(new UnsupportedMediaTypeException({ statusCode: 415, code: 'invalid_image' }), false),
    }),
  )
  avatar(@CurrentUser() user: AuthContext, @UploadedFile() file: { buffer: Buffer } | undefined) {
    if (!file) throw new BadRequestException({ statusCode: 400, code: 'validation_failed' });
    return this.photographers.setAvatar(user, file.buffer);
  }
}

@Public()
@Controller()
export class PublicPhotographersController {
  constructor(private readonly photographers: PhotographersService) {}

  @Get('photographers')
  list(@Query(new ZodPipe(z.object({ q: z.string().trim().max(100).optional() }))) query: { q?: string | undefined }) {
    return this.photographers.list(query.q || undefined);
  }

  @Get('photographers/:slug')
  get(@Param('slug', new ZodPipe(z.string().max(60).regex(PROFILE_SLUG_RE))) slug: string) {
    return this.photographers.get(slug);
  }

  @Get('stats')
  stats() {
    return this.photographers.stats();
  }
}
