import { monthlyHistory, monthsEndingAt, savingsIdeas, shiftMonth } from '@nestmint/finance-engine';
import { Inject, Injectable } from '@nestjs/common';
import {
  HISTORY_MONTHS,
  type HistoryResponse,
  type MonthBreakdownResponse,
  type SavingsIdeasResponse,
  TOP_EXPENSES,
} from '@nestmint/shared';
import { INCOME_REPOSITORY, type IncomeRepository } from '../income/income.repository.js';
import {
  TRANSACTIONS_REPOSITORY,
  type TransactionsRepository,
} from '../transactions/transactions.repository.js';

@Injectable()
export class InsightsService {
  constructor(
    @Inject(INCOME_REPOSITORY) private readonly income: IncomeRepository,
    @Inject(TRANSACTIONS_REPOSITORY) private readonly transactions: TransactionsRepository,
  ) {}

  /** Where one month's money went ("YYYY-MM"): totals per category and the biggest transactions. */
  async breakdown(userId: string, month: string): Promise<MonthBreakdownResponse> {
    const [categories, top] = await Promise.all([
      this.transactions.sumByCategory(userId, month),
      this.transactions.listBiggest(userId, month, TOP_EXPENSES),
    ]);
    return { month, categories, top };
  }

  /** The HISTORY_MONTHS months ending at `month`, oldest first. The maths is in the finance engine. */
  async history(userId: string, month: string): Promise<HistoryResponse> {
    const months = monthsEndingAt(month, HISTORY_MONTHS);
    const [sources, expensesByMonth] = await Promise.all([
      this.income.list(userId),
      this.transactions.sumByMonth(userId, months[0]!, month),
    ]);
    return {
      months: monthlyHistory(month, HISTORY_MONTHS, sources, expensesByMonth).map((m) => ({
        month: m.month,
        incomeMkd: m.income,
        expensesMkd: m.expenses,
        netMkd: m.net,
        cumulativeNetMkd: m.cumulativeNet,
        savingsRate: m.savingsRate,
      })),
    };
  }

  /**
   * Suggestions from the complete months before `month` (up to six that had spending), by the
   * rules in the finance engine. Every idea says why and how its saving was worked out.
   */
  async ideas(userId: string, month: string): Promise<SavingsIdeasResponse> {
    const window = monthsEndingAt(shiftMonth(month, -1), 6);
    const rows = await Promise.all(window.map((m) => this.transactions.sumByCategory(userId, m)));
    const byMonth = Object.fromEntries(
      window.map((m, i) => [
        m,
        rows[i]!.map((r) => ({
          categoryId: r.categoryId,
          categoryName: r.categoryName,
          amountMkd: r.amountMkd,
        })),
      ]),
    );
    const months = window.filter((m) => byMonth[m]!.length > 0);
    const ideas = savingsIdeas(months, byMonth);
    const totalMonthlyMkd = ideas.reduce((t, i) => t + i.monthlyImpactMkd, 0);
    return { months, ideas, totalMonthlyMkd, totalYearlyMkd: totalMonthlyMkd * 12 };
  }
}
