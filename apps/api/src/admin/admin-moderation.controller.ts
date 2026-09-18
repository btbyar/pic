import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, Req } from '@nestjs/common';
import {
  deletePhotoSchema,
  hidePhotoSchema,
  removalListQuerySchema,
  type ResolveRemovalInput,
  resolveRemovalSchema,
} from '@pic/shared';
import type { z } from 'zod';
import { AuthService } from '../auth/auth.service';
import { type AuthContext, CurrentUser, Roles } from '../auth/decorators';
import { clientIp } from '../common/request-meta';
import { ZodPipe } from '../common/zod.pipe';
import { AdminOverviewService } from './admin-overview.service';
import { ModerationService } from './moderation.service';
import type { AuthedRequest } from '../auth/decorators';

@Roles('ADMIN')
@Controller('admin')
export class AdminModerationController {
  constructor(
    private readonly moderation: ModerationService,
    private readonly overview: AdminOverviewService,
    private readonly auth: AuthService,
  ) {}

  @Get('overview')
  getOverview() {
    return this.overview.overview();
  }

  @Get('removal-requests')
  listRemovals(@Query(new ZodPipe(removalListQuerySchema)) query: z.output<typeof removalListQuerySchema>) {
    return this.moderation.listRemovalRequests(query.status, query.cursor);
  }

  @Post('removal-requests/:id/resolve')
  @HttpCode(200)
  async resolveRemoval(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(resolveRemovalSchema)) body: ResolveRemovalInput,
    @CurrentUser() admin: AuthContext,
    @Req() req: AuthedRequest,
  ) {
    // Зураг бүрмөсөн устгах нь эргэлт буцалтгүй тул TOTP-г дахин асууна
    if (body.action === 'delete') await this.auth.requireStepUpMfa(admin, body.totpCode);
    return this.moderation.resolveRemovalRequest(admin, id, { action: body.action, note: body.note }, clientIp(req));
  }

  @Post('photos/:id/hide')
  @HttpCode(200)
  hidePhoto(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(hidePhotoSchema)) body: { reason: string },
    @CurrentUser() admin: AuthContext,
    @Req() req: AuthedRequest,
  ) {
    return this.moderation.hidePhoto(admin, id, body.reason, clientIp(req));
  }

  @Post('photos/:id/unhide')
  @HttpCode(200)
  unhidePhoto(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() admin: AuthContext, @Req() req: AuthedRequest) {
    return this.moderation.unhidePhoto(admin, id, clientIp(req));
  }

  @Delete('photos/:id')
  @HttpCode(200)
  async deletePhoto(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(deletePhotoSchema)) body: z.output<typeof deletePhotoSchema>,
    @CurrentUser() admin: AuthContext,
    @Req() req: AuthedRequest,
  ) {
    await this.auth.requireStepUpMfa(admin, body.totpCode);
    return this.moderation.deletePhoto(admin, id, clientIp(req));
  }
}
