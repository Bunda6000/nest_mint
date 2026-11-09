import { Module } from '@nestjs/common';
import { IncomeModule } from '../income/income.module.js';
import { TransactionsModule } from '../transactions/transactions.module.js';
import { SummaryController } from './summary.controller.js';
import { SummaryService } from './summary.service.js';

@Module({
  imports: [IncomeModule, TransactionsModule],
  controllers: [SummaryController],
  providers: [SummaryService],
})
export class SummaryModule {}
