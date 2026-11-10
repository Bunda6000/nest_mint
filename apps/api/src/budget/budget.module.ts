import { Module } from '@nestjs/common';
import { BillsModule } from '../bills/bills.module.js';
import { CategoriesModule } from '../categories/categories.module.js';
import { IncomeModule } from '../income/income.module.js';
import { TransactionsModule } from '../transactions/transactions.module.js';
import { BudgetController } from './budget.controller.js';
import { BudgetService } from './budget.service.js';

@Module({
  imports: [BillsModule, CategoriesModule, IncomeModule, TransactionsModule],
  controllers: [BudgetController],
  providers: [BudgetService],
})
export class BudgetModule {}
