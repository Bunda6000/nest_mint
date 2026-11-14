import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module.js';
import { CategoriesModule } from './categories/categories.module.js';
import { ForecastModule } from './forecast/forecast.module.js';
import { GoalsModule } from './goals/goals.module.js';
import { HealthScoreModule } from './health-score/health-score.module.js';
import { HealthModule } from './health/health.module.js';
import { IncomeModule } from './income/income.module.js';
import { BillsModule } from './bills/bills.module.js';
import { BudgetModule } from './budget/budget.module.js';
import { InsightsModule } from './insights/insights.module.js';
import { LoansModule } from './loans/loans.module.js';
import { BudgetImportModule } from './budget-import/budget-import.module.js';
import { ExchangeRatesModule } from './exchange-rates/exchange-rates.module.js';
import { JobsModule } from './jobs/jobs.module.js';
import { BalanceCheckInsModule } from './balance-check-ins/balance-check-ins.module.js';
import { ObligationLedgerModule } from './obligation-ledger/obligation-ledger.module.js';
import { ObligationRemovalModule } from './obligation-removal/obligation-removal.module.js';
import { ObligationsModule } from './obligations/obligations.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { SummaryModule } from './summary/summary.module.js';
import { TransactionsModule } from './transactions/transactions.module.js';

@Module({
  imports: [
    PrismaModule,
    HealthModule,
    AuthModule,
    CategoriesModule,
    TransactionsModule,
    IncomeModule,
    SummaryModule,
    InsightsModule,
    ObligationsModule,
    ObligationLedgerModule,
    BalanceCheckInsModule,
    JobsModule,
    ExchangeRatesModule,
    ForecastModule,
    GoalsModule,
    HealthScoreModule,
    BudgetImportModule,
    BillsModule,
    LoansModule,
    ObligationRemovalModule,
    BudgetModule,
  ],
})
export class AppModule {}
