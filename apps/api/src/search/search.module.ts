import { Module } from '@nestjs/common';
import { EventsModule } from '../events/events.module';
import { RemovalRequestsController } from './removal-requests.controller';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';

@Module({
  imports: [EventsModule],
  controllers: [SearchController, RemovalRequestsController],
  providers: [SearchService],
})
export class SearchModule {}
