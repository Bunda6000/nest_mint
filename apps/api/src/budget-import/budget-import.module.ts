import { Module } from '@nestjs/common';
import { CategoriesModule } from '../categories/categories.module.js';
import { Clock } from '../common/clock.js';
import { BudgetImportController } from './budget-import.controller.js';
import { BudgetImportService } from './budget-import.service.js';

@Module({
  imports: [CategoriesModule],
  controllers: [BudgetImportController],
  providers: [BudgetImportService, Clock],
})
export class BudgetImportModule {}
