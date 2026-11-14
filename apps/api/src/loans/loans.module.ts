import { Module } from '@nestjs/common';
import { BillsModule } from '../bills/bills.module.js';
import { ObligationsModule } from '../obligations/obligations.module.js';
import { LoansController } from './loans.controller.js';
import { LoansService } from './loans.service.js';

@Module({
  imports: [ObligationsModule, BillsModule],
  controllers: [LoansController],
  providers: [LoansService],
})
export class LoansModule {}
