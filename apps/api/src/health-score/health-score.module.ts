import { Module } from '@nestjs/common';
import { Clock } from '../common/clock.js';
import { GoalsModule } from '../goals/goals.module.js';
import { IncomeModule } from '../income/income.module.js';
import { TransactionsModule } from '../transactions/transactions.module.js';
import { HealthScoreController } from './health-score.controller.js';
import { HealthScoreService } from './health-score.service.js';

@Module({
  imports: [GoalsModule, IncomeModule, TransactionsModule],
  controllers: [HealthScoreController],
  providers: [HealthScoreService, Clock],
})
export class HealthScoreModule {}
