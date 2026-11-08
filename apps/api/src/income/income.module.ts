import { Module } from '@nestjs/common';
import { IncomeController } from './income.controller.js';
import { INCOME_REPOSITORY } from './income.repository.js';
import { IncomeService } from './income.service.js';
import { PrismaIncomeRepository } from './prisma-income.repository.js';

@Module({
  controllers: [IncomeController],
  providers: [IncomeService, { provide: INCOME_REPOSITORY, useClass: PrismaIncomeRepository }],
})
export class IncomeModule {}
