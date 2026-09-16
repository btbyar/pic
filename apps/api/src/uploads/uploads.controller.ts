import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import {
  completeUploadsSchema,
  createUploadBatchSchema,
  registerUploadFilesSchema,
  type UploadFileInput,
} from '@pic/shared';
import { type AuthContext, CurrentUser, Roles } from '../auth/decorators';
import { ZodPipe } from '../common/zod.pipe';
import { UploadsService } from './uploads.service';

@Roles('PHOTOGRAPHER')
@Controller('photographer')
export class UploadsController {
  constructor(private readonly uploads: UploadsService) {}

  @Post('events/:id/upload-batches')
  createBatch(
    @CurrentUser() user: AuthContext,
    @Param('id', ParseUUIDPipe) eventId: string,
    @Body(new ZodPipe(createUploadBatchSchema)) body: { totalFiles: number },
  ) {
    return this.uploads.createBatch(user, eventId, body.totalFiles);
  }

  @Get('events/:id/photo-stats')
  photoStats(@CurrentUser() user: AuthContext, @Param('id', ParseUUIDPipe) eventId: string) {
    return this.uploads.photoStats(user, eventId);
  }

  @Post('upload-batches/:batchId/files')
  @HttpCode(200)
  async registerFiles(
    @CurrentUser() user: AuthContext,
    @Param('batchId', ParseUUIDPipe) batchId: string,
    @Body(new ZodPipe(registerUploadFilesSchema)) body: { files: UploadFileInput[] },
  ) {
    return { files: await this.uploads.registerFiles(user, batchId, body.files) };
  }

  @Post('upload-batches/:batchId/complete')
  @HttpCode(200)
  async complete(
    @CurrentUser() user: AuthContext,
    @Param('batchId', ParseUUIDPipe) batchId: string,
    @Body(new ZodPipe(completeUploadsSchema)) body: { photoIds: string[] },
  ) {
    return { results: await this.uploads.complete(user, batchId, body.photoIds) };
  }
}
