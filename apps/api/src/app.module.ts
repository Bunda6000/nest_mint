import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module.js';
import { CategoriesModule } from './categories/categories.module.js';
import { HealthModule } from './health/health.module.js';
import { IncomeModule } from './income/income.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { TransactionsModule } from './transactions/transactions.module.js';

@Module({
  imports: [
    PrismaModule,
    HealthModule,
    AuthModule,
    CategoriesModule,
    TransactionsModule,
    IncomeModule,
  ],
})
export class AppModule {}
