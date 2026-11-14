import { Module } from '@nestjs/common';
import { BillsModule } from '../bills/bills.module.js';
import { ObligationsModule } from '../obligations/obligations.module.js';
import { ObligationRemovalController } from './obligation-removal.controller.js';
import { ObligationRemovalService } from './obligation-removal.service.js';

@Module({
  imports: [ObligationsModule, BillsModule],
  controllers: [ObligationRemovalController],
  providers: [ObligationRemovalService],
})
export class ObligationRemovalModule {}
