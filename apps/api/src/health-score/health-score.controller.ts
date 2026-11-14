import { Controller, Get } from '@nestjs/common';
import type { HealthScoreResponse } from '@nestmint/shared';
import { type AuthenticatedUser, CurrentUser } from '../auth/current-user.decorator.js';
import { HealthScoreService } from './health-score.service.js';

@Controller('health-score')
export class HealthScoreController {
  constructor(private readonly health: HealthScoreService) {}

  @Get()
  get(@CurrentUser() user: AuthenticatedUser): Promise<HealthScoreResponse> {
    return this.health.compute(user.id);
  }
}
