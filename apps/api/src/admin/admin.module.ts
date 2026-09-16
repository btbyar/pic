import { Module } from '@nestjs/common';
import { AdminPhotographersController } from './admin-photographers.controller';

@Module({
  controllers: [AdminPhotographersController],
})
export class AdminModule {}
