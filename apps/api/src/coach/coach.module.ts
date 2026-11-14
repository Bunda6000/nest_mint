import { Module } from '@nestjs/common';
import { Clock } from '../common/clock.js';
import { GoalsModule } from '../goals/goals.module.js';
import { HealthScoreModule } from '../health-score/health-score.module.js';
import { InsightsModule } from '../insights/insights.module.js';
import { COACH_PROVIDER } from './coach.provider.js';
import { CoachController } from './coach.controller.js';
import { CoachService } from './coach.service.js';
import { RuleBasedCoachProvider } from './rule-based-coach.provider.js';

@Module({
  imports: [GoalsModule, HealthScoreModule, InsightsModule],
  controllers: [CoachController],
  providers: [CoachService, Clock, { provide: COACH_PROVIDER, useClass: RuleBasedCoachProvider }],
})
export class CoachModule {}
