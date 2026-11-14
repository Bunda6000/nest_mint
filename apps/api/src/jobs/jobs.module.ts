import { Module } from '@nestjs/common';
import { BillsModule } from '../bills/bills.module.js';
import { UsersModule } from '../users/users.module.js';
import { JobsController } from './jobs.controller.js';
import { MonthlyJobService } from './monthly-job.service.js';

@Module({
  imports: [BillsModule, UsersModule],
  controllers: [JobsController],
  providers: [MonthlyJobService],
})
export class JobsModule {}
