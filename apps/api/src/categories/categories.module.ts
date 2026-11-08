import { Module } from '@nestjs/common';
import { Clock } from '../common/clock.js';
import { CategoriesController } from './categories.controller.js';
import { CATEGORIES_REPOSITORY } from './categories.repository.js';
import { CategoriesService } from './categories.service.js';
import { PrismaCategoriesRepository } from './prisma-categories.repository.js';

@Module({
  controllers: [CategoriesController],
  providers: [
    Clock,
    CategoriesService,
    { provide: CATEGORIES_REPOSITORY, useClass: PrismaCategoriesRepository },
  ],
  // Other features check that a category exists, is the user's and is not archived.
  exports: [CATEGORIES_REPOSITORY],
})
export class CategoriesModule {}
