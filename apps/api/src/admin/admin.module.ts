import { Module } from '@nestjs/common';
import { AdminFinanceController } from './admin-finance.controller';
import { AdminModerationController } from './admin-moderation.controller';
import { AdminOverviewService } from './admin-overview.service';
import { AdminPhotographersController } from './admin-photographers.controller';
import { FinanceService } from './finance.service';
import { ModerationService } from './moderation.service';

@Module({
  controllers: [AdminPhotographersController, AdminModerationController, AdminFinanceController],
  providers: [ModerationService, AdminOverviewService, FinanceService],
})
export class AdminModule {}
