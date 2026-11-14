import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { BillsModule } from '../bills/bills.module.js';
import { UsersModule } from '../users/users.module.js';
import { JobsController } from './jobs.controller.js';
import { MonthlyJobService } from './monthly-job.service.js';

@Module({
  imports: [AuthModule, BillsModule, UsersModule],
  controllers: [JobsController],
  providers: [MonthlyJobService],
})
export class JobsModule {}
