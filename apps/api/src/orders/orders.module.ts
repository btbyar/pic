import { Module } from '@nestjs/common';
import { EventsModule } from '../events/events.module';
import { SearchModule } from '../search/search.module';
import { OrdersController, PaymentsController } from './orders.controller';
import { OrdersService } from './orders.service';

@Module({
  imports: [EventsModule, SearchModule],
  controllers: [OrdersController, PaymentsController],
  providers: [OrdersService],
})
export class OrdersModule {}
