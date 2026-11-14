import { Module } from '@nestjs/common';
import { Clock } from '../common/clock.js';
import { GoalsController } from './goals.controller.js';
import { GOALS_REPOSITORY } from './goals.repository.js';
import { GoalsService } from './goals.service.js';
import { PrismaGoalsRepository } from './prisma-goals.repository.js';

@Module({
  controllers: [GoalsController],
  providers: [GoalsService, Clock, { provide: GOALS_REPOSITORY, useClass: PrismaGoalsRepository }],
  exports: [GoalsService],
})
export class GoalsModule {}
