import { Module } from '@nestjs/common';
import { EventsModule } from '../events/events.module';
import { PhotographerProfileController, PublicPhotographersController } from './photographers.controller';
import { PhotographersService } from './photographers.service';

@Module({
  imports: [EventsModule],
  controllers: [PhotographerProfileController, PublicPhotographersController],
  providers: [PhotographersService],
})
export class PhotographersModule {}
