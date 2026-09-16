import { Module } from '@nestjs/common';
import { EventsService } from './events.service';
import { PhotographerEventsController } from './photographer-events.controller';
import { PublicEventsController } from './public-events.controller';

@Module({
  controllers: [PhotographerEventsController, PublicEventsController],
  providers: [EventsService],
  exports: [EventsService],
})
export class EventsModule {}
