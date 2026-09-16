import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put } from '@nestjs/common';
import {
  addEventPhotographerSchema,
  clockOffsetSchema,
  type CreateEventInput,
  createEventSchema,
  type UpdateEventInput,
  updateEventSchema,
} from '@pic/shared';
import { type AuthContext, CurrentUser, Roles } from '../auth/decorators';
import { ZodPipe } from '../common/zod.pipe';
import { EventsService } from './events.service';

@Roles('PHOTOGRAPHER')
@Controller('photographer/events')
export class PhotographerEventsController {
  constructor(private readonly events: EventsService) {}

  @Post()
  create(@CurrentUser() user: AuthContext, @Body(new ZodPipe(createEventSchema)) body: CreateEventInput) {
    return this.events.create(user, body);
  }

  @Get()
  list(@CurrentUser() user: AuthContext) {
    return this.events.listMine(user);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.events.getMine(user, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(updateEventSchema)) body: UpdateEventInput,
  ) {
    return this.events.update(user, id, body);
  }

  @Post(':id/access-link')
  @HttpCode(200)
  rotateAccessLink(@CurrentUser() user: AuthContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.events.rotateAccessLink(user, id);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@CurrentUser() user: AuthContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.events.softDelete(user, id);
  }

  @Post(':id/photographers')
  addPhotographer(
    @CurrentUser() user: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(addEventPhotographerSchema)) body: { email: string },
  ) {
    return this.events.addPhotographer(user, id, body.email);
  }

  @Delete(':id/photographers/:userId')
  removePhotographer(
    @CurrentUser() user: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) userId: string,
  ) {
    return this.events.removePhotographer(user, id, userId);
  }

  @Put(':id/clock-offset')
  setClockOffset(
    @CurrentUser() user: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(clockOffsetSchema)) body: { clockOffsetSec: number },
  ) {
    return this.events.setMyClockOffset(user, id, body.clockOffsetSec);
  }
}
