import { Module } from '@nestjs/common';
import { BalanceCheckInsModule } from '../balance-check-ins/balance-check-ins.module.js';
import { Clock } from '../common/clock.js';
import { GoalsModule } from '../goals/goals.module.js';
import { HealthScoreModule } from '../health-score/health-score.module.js';
import { IncomeModule } from '../income/income.module.js';
import { TransactionsModule } from '../transactions/transactions.module.js';
import { ForecastController } from './forecast.controller.js';
import { ForecastService } from './forecast.service.js';

@Module({
  imports: [
    BalanceCheckInsModule,
    GoalsModule,
    HealthScoreModule,
    IncomeModule,
    TransactionsModule,
  ],
  controllers: [ForecastController],
  providers: [ForecastService, Clock],
})
export class ForecastModule {}
