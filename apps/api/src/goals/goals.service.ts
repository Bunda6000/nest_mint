import { goalProgress, recentPace } from '@nestmint/finance-engine';
import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import {
  type AddContributionData,
  type ContributionResponse,
  type ContributionsResponse,
  type CreateGoalData,
  ErrorCode,
  type GoalResponse,
  type GoalsResponse,
  type UpdateGoalData,
} from '@nestmint/shared';
import { ApiException } from '../common/api.exception.js';
import { Clock } from '../common/clock.js';
import {
  type GoalChange,
  GOALS_REPOSITORY,
  type GoalsRepository,
  type StoredContribution,
  type StoredGoal,
} from './goals.repository.js';

const notFound = () =>
  new ApiException(HttpStatus.NOT_FOUND, ErrorCode.NotFound, 'Goal not found.');
const fieldError = (field: string, message: string) =>
  new ApiException(HttpStatus.BAD_REQUEST, ErrorCode.ValidationFailed, 'Some fields are invalid.', {
    [field]: message,
  });

const sum = (rows: readonly StoredContribution[]) => rows.reduce((t, c) => t + c.amountMkd, 0);

@Injectable()
export class GoalsService {
  constructor(
    @Inject(GOALS_REPOSITORY) private readonly goals: GoalsRepository,
    private readonly clock: Clock,
  ) {}

  private today(): string {
    return this.clock.now().toISOString().slice(0, 10);
  }

  private view(goal: StoredGoal, contributions: readonly StoredContribution[]): GoalResponse {
    const currentMonth = this.today().slice(0, 7);
    const mine = contributions.filter((c) => c.goalId === goal.id);
    const progress = goalProgress({
      kind: goal.kind,
      targetMkd: goal.targetMkd,
      targetMonth: goal.targetMonth,
      monthlyMkd: goal.monthlyMkd,
      savedMkd: sum(mine),
      recentPaceMkd: recentPace(
        mine.map((c) => ({ month: c.occurredOn.slice(0, 7), amountMkd: c.amountMkd })),
        currentMonth,
      ),
      currentMonth,
    });
    return {
      id: goal.id,
      name: goal.name,
      kind: goal.kind,
      priority: goal.priority,
      archived: goal.archived,
      targetMkd: goal.targetMkd,
      targetMonth: goal.targetMonth,
      monthlyMkd: goal.monthlyMkd,
      ...progress,
    };
  }

  async list(userId: string, includeArchived = false): Promise<GoalsResponse> {
    const [goals, contributions] = await Promise.all([
      this.goals.list(userId, includeArchived),
      this.goals.contributions(userId),
    ]);
    return { goals: goals.map((g) => this.view(g, contributions)) };
  }

  private async one(userId: string, goalId: string): Promise<GoalResponse> {
    const goal = await this.goals.find(userId, goalId);
    if (!goal) throw notFound();
    return this.view(goal, await this.goals.contributions(userId, goalId));
  }

  get(userId: string, goalId: string): Promise<GoalResponse> {
    return this.one(userId, goalId);
  }

  async create(userId: string, input: CreateGoalData): Promise<GoalResponse> {
    if (input.kind === 'target_date' && input.targetMonth < this.today().slice(0, 7)) {
      throw fieldError('targetMonth', 'Choose this month or a later one');
    }
    const stored = await this.goals.create(
      userId,
      {
        name: input.name,
        kind: input.kind,
        priority: input.priority,
        targetMkd: input.kind === 'monthly' ? null : input.targetMkd,
        targetMonth: input.kind === 'target_date' ? input.targetMonth : null,
        monthlyMkd: input.monthlyMkd ?? null,
      },
      input.startingMkd
        ? { amountMkd: input.startingMkd, occurredOn: this.today(), note: 'Starting amount' }
        : null,
    );
    return this.one(userId, stored.id);
  }

  async update(userId: string, goalId: string, change: UpdateGoalData): Promise<GoalResponse> {
    const goal = await this.goals.find(userId, goalId);
    if (!goal) throw notFound();
    if (change.targetMkd !== undefined && goal.kind === 'monthly') {
      throw fieldError('targetMkd', 'A monthly goal has no target amount');
    }
    if (change.targetMonth !== undefined && goal.kind !== 'target_date') {
      throw fieldError('targetMonth', 'Only a goal with a date has a target month');
    }
    if (change.monthlyMkd === null && goal.kind === 'monthly') {
      throw fieldError('monthlyMkd', 'A monthly goal needs a monthly amount');
    }
    const { archived, ...rest } = change;
    const patch: GoalChange = { ...rest, ...(archived !== undefined ? { archived } : {}) };
    if (!(await this.goals.update(userId, goalId, patch))) throw notFound();
    return this.one(userId, goalId);
  }

  async remove(userId: string, goalId: string): Promise<void> {
    if (!(await this.goals.delete(userId, goalId))) throw notFound();
  }

  async contributions(userId: string, goalId: string): Promise<ContributionsResponse> {
    if (!(await this.goals.find(userId, goalId))) throw notFound();
    const rows = await this.goals.contributions(userId, goalId);
    return { contributions: [...rows].reverse().map(toContribution) };
  }

  async addContribution(
    userId: string,
    goalId: string,
    input: AddContributionData,
  ): Promise<GoalResponse> {
    const goal = await this.goals.find(userId, goalId);
    if (!goal) throw notFound();
    if (goal.archived) {
      throw new ApiException(
        HttpStatus.CONFLICT,
        ErrorCode.Conflict,
        'This goal is archived. Restore it before adding money.',
      );
    }
    if (input.occurredOn > this.today()) throw fieldError('occurredOn', 'Choose today or earlier');
    const saved = sum(await this.goals.contributions(userId, goalId));
    if (saved + input.amountMkd < 0) {
      throw fieldError('amountMkd', 'You cannot take out more than is saved');
    }
    await this.goals.addContribution(userId, goalId, {
      amountMkd: input.amountMkd,
      occurredOn: input.occurredOn,
      note: input.note ? input.note : null,
    });
    return this.one(userId, goalId);
  }

  async removeContribution(
    userId: string,
    goalId: string,
    contributionId: string,
  ): Promise<GoalResponse> {
    if (!(await this.goals.find(userId, goalId))) throw notFound();
    const rows = await this.goals.contributions(userId, goalId);
    const target = rows.find((c) => c.id === contributionId);
    if (!target) throw notFound();
    if (sum(rows) - target.amountMkd < 0) {
      throw new ApiException(
        HttpStatus.CONFLICT,
        ErrorCode.Conflict,
        'Removing this would leave less than nothing saved. Remove the later withdrawals first.',
      );
    }
    await this.goals.deleteContribution(userId, goalId, contributionId);
    return this.one(userId, goalId);
  }
}

const toContribution = (c: StoredContribution): ContributionResponse => ({
  id: c.id,
  amountMkd: c.amountMkd,
  occurredOn: c.occurredOn,
  note: c.note,
});
