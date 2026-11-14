import { Module } from '@nestjs/common';
import { Clock } from '../common/clock.js';
import { BillsModule } from '../bills/bills.module.js';
import { ObligationsModule } from '../obligations/obligations.module.js';
import { TransactionsModule } from '../transactions/transactions.module.js';
import { LoansController } from './loans.controller.js';
import { LoansService } from './loans.service.js';

@Module({
  imports: [ObligationsModule, BillsModule, TransactionsModule],
  controllers: [LoansController],
  providers: [LoansService, Clock],
})
export class LoansModule {}
