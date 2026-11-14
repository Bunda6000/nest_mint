import { Module } from '@nestjs/common';
import { BillsModule } from '../bills/bills.module.js';
import { Clock } from '../common/clock.js';
import { ObligationsModule } from '../obligations/obligations.module.js';
import { ObligationLedgerController } from './obligation-ledger.controller.js';
import { ObligationLedgerService } from './obligation-ledger.service.js';

@Module({
  imports: [ObligationsModule, BillsModule],
  controllers: [ObligationLedgerController],
  providers: [ObligationLedgerService, Clock],
})
export class ObligationLedgerModule {}
