import { Module } from '@nestjs/common';
import { IncomeModule } from '../income/income.module.js';
import { TransactionsModule } from '../transactions/transactions.module.js';
import { InsightsController } from './insights.controller.js';
import { InsightsService } from './insights.service.js';

@Module({
  imports: [IncomeModule, TransactionsModule],
  controllers: [InsightsController],
  providers: [InsightsService],
  exports: [InsightsService],
})
export class InsightsModule {}
