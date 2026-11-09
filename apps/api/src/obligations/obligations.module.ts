import { Module } from '@nestjs/common';
import { CategoriesModule } from '../categories/categories.module.js';
import { ObligationsController } from './obligations.controller.js';
import { OBLIGATIONS_REPOSITORY } from './obligations.repository.js';
import { ObligationsService } from './obligations.service.js';
import { PrismaObligationsRepository } from './prisma-obligations.repository.js';

@Module({
  imports: [CategoriesModule],
  controllers: [ObligationsController],
  providers: [
    ObligationsService,
    { provide: OBLIGATIONS_REPOSITORY, useClass: PrismaObligationsRepository },
  ],
  exports: [OBLIGATIONS_REPOSITORY],
})
export class ObligationsModule {}
