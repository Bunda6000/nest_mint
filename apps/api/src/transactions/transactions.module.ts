import { Module } from '@nestjs/common';
import { CategoriesModule } from '../categories/categories.module.js';
import { Clock } from '../common/clock.js';
import { PrismaTransactionsRepository } from './prisma-transactions.repository.js';
import { TransactionsController } from './transactions.controller.js';
import { TRANSACTIONS_REPOSITORY } from './transactions.repository.js';
import { TransactionsService } from './transactions.service.js';

@Module({
  imports: [CategoriesModule],
  controllers: [TransactionsController],
  providers: [
    Clock,
    TransactionsService,
    { provide: TRANSACTIONS_REPOSITORY, useClass: PrismaTransactionsRepository },
  ],
  exports: [TRANSACTIONS_REPOSITORY],
})
export class TransactionsModule {}
