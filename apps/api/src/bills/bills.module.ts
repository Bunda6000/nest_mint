import { Module } from '@nestjs/common';
import { Clock } from '../common/clock.js';
import { ObligationsModule } from '../obligations/obligations.module.js';
import { BILLS_REPOSITORY } from './bills.repository.js';
import { BillsController } from './bills.controller.js';
import { BillsService } from './bills.service.js';
import { PrismaBillsRepository } from './prisma-bills.repository.js';

@Module({
  imports: [ObligationsModule],
  controllers: [BillsController],
  providers: [BillsService, Clock, { provide: BILLS_REPOSITORY, useClass: PrismaBillsRepository }],
  exports: [BILLS_REPOSITORY],
})
export class BillsModule {}
