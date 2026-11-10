import { budgetGrid, type GridCell } from '@nestmint/finance-engine';
import { Inject, Injectable } from '@nestjs/common';
import type { BudgetCellResponse, BudgetGridResponse, GroupMonthTotal } from '@nestmint/shared';
import { BILLS_REPOSITORY, type BillsRepository } from '../bills/bills.repository.js';
import {
  CATEGORIES_REPOSITORY,
  type CategoriesRepository,
} from '../categories/categories.repository.js';
import { INCOME_REPOSITORY, type IncomeRepository } from '../income/income.repository.js';
import {
  TRANSACTIONS_REPOSITORY,
  type TransactionsRepository,
} from '../transactions/transactions.repository.js';

const cell = (c: GridCell): BudgetCellResponse => ({ plannedMkd: c.planned, actualMkd: c.actual });
const amounts = (totals: GroupMonthTotal[]) =>
  totals.map((t) => ({ month: t.month, groupId: t.groupId, amount: t.amountMkd }));

@Injectable()
export class BudgetService {
  constructor(
    @Inject(INCOME_REPOSITORY) private readonly income: IncomeRepository,
    @Inject(TRANSACTIONS_REPOSITORY) private readonly transactions: TransactionsRepository,
    @Inject(BILLS_REPOSITORY) private readonly bills: BillsRepository,
    @Inject(CATEGORIES_REPOSITORY) private readonly categories: CategoriesRepository,
  ) {}

  /**
   * The budget grid of one year for one user (NM-27): actual spending per category group and month
   * from paid transactions, planned from the bills' expected amounts. The maths is in the finance
   * engine. Active groups always get a row; an archived group only when it has amounts that year.
   */
  async year(userId: string, year: number): Promise<BudgetGridResponse> {
    const from = `${year}-01`;
    const to = `${year}-12`;
    const [sources, actual, planned, { groups }] = await Promise.all([
      this.income.list(userId),
      this.transactions.sumByGroupAndMonth(userId, from, to),
      this.bills.sumExpectedByGroupAndMonth(userId, from, to),
      this.categories.list(userId, true),
    ]);
    const used = new Set([...actual, ...planned].map((t) => t.groupId));
    const shown = groups.filter((g) => !g.archived || used.has(g.id));

    const grid = budgetGrid({
      year,
      groups: shown.map((g) => ({ id: g.id, name: g.name })),
      income: sources,
      actual: amounts(actual),
      planned: amounts(planned),
    });
    return {
      year: grid.year,
      months: grid.months,
      incomeMkd: grid.income,
      incomeTotalMkd: grid.incomeTotal,
      groups: grid.groups.map((g) => ({
        groupId: g.id,
        groupName: g.name,
        months: g.months.map(cell),
        total: cell(g.total),
      })),
      expenses: grid.expenses.map(cell),
      expensesTotal: cell(grid.expensesTotal),
      netMkd: grid.net,
      netTotalMkd: grid.netTotal,
      savingsRate: grid.savingsRate,
      savingsRateTotal: grid.savingsRateTotal,
    };
  }
}
