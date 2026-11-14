import { healthScore, monthsEndingAt, monthlyTotals, shiftMonth } from '@nestmint/finance-engine';
import { Inject, Injectable } from '@nestjs/common';
import type { HealthScoreResponse } from '@nestmint/shared';
import { Clock } from '../common/clock.js';
import { GoalsService } from '../goals/goals.service.js';
import { INCOME_REPOSITORY, type IncomeRepository } from '../income/income.repository.js';
import {
  TRANSACTIONS_REPOSITORY,
  type TransactionsRepository,
} from '../transactions/transactions.repository.js';

/** How many complete months the score looks back over. */
export const HEALTH_MONTHS = 6;

@Injectable()
export class HealthScoreService {
  constructor(
    @Inject(INCOME_REPOSITORY) private readonly income: IncomeRepository,
    @Inject(TRANSACTIONS_REPOSITORY) private readonly transactions: TransactionsRepository,
    private readonly goals: GoalsService,
    private readonly clock: Clock,
  ) {}

  /**
   * Scores the last complete months that had income. A brand-new user with no complete month yet
   * is scored on the running month instead, so the screen is useful from day one. `what` applies a
   * what-if to every month looked at (NM-61), so the score can be compared before and after.
   */
  async compute(
    userId: string,
    what?: { incomeChange?: number; expenseChangeMkd?: number },
  ): Promise<HealthScoreResponse> {
    const current = this.clock.now().toISOString().slice(0, 7);
    const window = monthsEndingAt(shiftMonth(current, -1), HEALTH_MONTHS);
    const [sources, expensesByMonth, { goals }] = await Promise.all([
      this.income.list(userId),
      this.transactions.sumByMonth(userId, window[0]!, current),
      this.goals.list(userId),
    ]);

    const totals = (months: string[]) =>
      months
        .map((m) => monthlyTotals(m, sources, expensesByMonth[m] ?? 0))
        .filter((t) => t.income > 0);

    let used = totals(window);
    if (used.length === 0) used = totals([current]);

    const result = healthScore({
      months: used.map((t) => ({
        income: Math.round(t.income * (1 + (what?.incomeChange ?? 0))),
        expenses: Math.max(0, t.expenses + (what?.expenseChangeMkd ?? 0)),
      })),
      savedMkd: goals.reduce((total, g) => total + g.savedMkd, 0),
      goalStatuses: goals.map((g) => g.status),
    });
    return { ...result, months: used.map((t) => t.month) };
  }
}
