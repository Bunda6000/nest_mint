import { Module } from '@nestjs/common';
import { Clock } from '../common/clock.js';
import { IncomeModule } from '../income/income.module.js';
import { TransactionsModule } from '../transactions/transactions.module.js';
import { BALANCE_CHECK_INS_REPOSITORY } from './balance-check-ins.repository.js';
import { BalanceCheckInsController } from './balance-check-ins.controller.js';
import { BalanceCheckInsService } from './balance-check-ins.service.js';
import { PrismaBalanceCheckInsRepository } from './prisma-balance-check-ins.repository.js';

@Module({
  imports: [IncomeModule, TransactionsModule],
  controllers: [BalanceCheckInsController],
  exports: [BALANCE_CHECK_INS_REPOSITORY],
  providers: [
    BalanceCheckInsService,
    Clock,
    { provide: BALANCE_CHECK_INS_REPOSITORY, useClass: PrismaBalanceCheckInsRepository },
  ],
})
export class BalanceCheckInsModule {}
