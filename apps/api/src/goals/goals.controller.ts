import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  type AddContributionData,
  addContributionSchema,
  type ContributionsResponse,
  type CreateGoalData,
  createGoalSchema,
  type GoalResponse,
  type GoalsResponse,
  type UpdateGoalData,
  updateGoalSchema,
} from '@nestmint/shared';
import { type AuthenticatedUser, CurrentUser } from '../auth/current-user.decorator.js';
import { UuidParamPipe } from '../common/uuid-param.pipe.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { GoalsService } from './goals.service.js';

@Controller('goals')
export class GoalsController {
  constructor(private readonly goals: GoalsService) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('includeArchived') includeArchived?: string,
  ): Promise<GoalsResponse> {
    return this.goals.list(user.id, includeArchived === 'true');
  }

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe<CreateGoalData>(createGoalSchema)) body: CreateGoalData,
  ): Promise<GoalResponse> {
    return this.goals.create(user.id, body);
  }

  @Get(':id')
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', UuidParamPipe) id: string,
  ): Promise<GoalResponse> {
    return this.goals.get(user.id, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', UuidParamPipe) id: string,
    @Body(new ZodValidationPipe<UpdateGoalData>(updateGoalSchema)) body: UpdateGoalData,
  ): Promise<GoalResponse> {
    return this.goals.update(user.id, id, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', UuidParamPipe) id: string,
  ): Promise<void> {
    return this.goals.remove(user.id, id);
  }

  @Get(':id/contributions')
  contributions(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', UuidParamPipe) id: string,
  ): Promise<ContributionsResponse> {
    return this.goals.contributions(user.id, id);
  }

  /** Returns the goal with its progress worked out again. */
  @Post(':id/contributions')
  add(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', UuidParamPipe) id: string,
    @Body(new ZodValidationPipe<AddContributionData>(addContributionSchema))
    body: AddContributionData,
  ): Promise<GoalResponse> {
    return this.goals.addContribution(user.id, id, body);
  }

  @Delete(':id/contributions/:contributionId')
  removeContribution(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', UuidParamPipe) id: string,
    @Param('contributionId', UuidParamPipe) contributionId: string,
  ): Promise<GoalResponse> {
    return this.goals.removeContribution(user.id, id, contributionId);
  }
}
