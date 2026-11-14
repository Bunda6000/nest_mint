import { Module } from '@nestjs/common';
import { IncomeModule } from '../income/income.module.js';
import { TransactionsModule } from '../transactions/transactions.module.js';
import { CategoriesModule } from '../categories/categories.module.js';
import { Clock } from '../common/clock.js';
import { BudgetImportController } from './budget-import.controller.js';
import { BudgetImportService } from './budget-import.service.js';

@Module({
  imports: [CategoriesModule, IncomeModule, TransactionsModule],
  controllers: [BudgetImportController],
  providers: [BudgetImportService, Clock],
})
export class BudgetImportModule {}
