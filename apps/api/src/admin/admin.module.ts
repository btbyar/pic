import { Module } from '@nestjs/common';
import { AdminModerationController } from './admin-moderation.controller';
import { AdminOverviewService } from './admin-overview.service';
import { AdminPhotographersController } from './admin-photographers.controller';
import { ModerationService } from './moderation.service';

@Module({
  controllers: [AdminPhotographersController, AdminModerationController],
  providers: [ModerationService, AdminOverviewService],
})
export class AdminModule {}
