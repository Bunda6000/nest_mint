import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import {
  type BudgetImportCommitResponse,
  type BudgetImportDecisions,
  type BudgetImportPreviewResponse,
  ErrorCode,
} from '@nestmint/shared';
import { ApiException } from '../common/api.exception.js';
import { Clock } from '../common/clock.js';
import { INCOME_REPOSITORY, type IncomeRepository } from '../income/income.repository.js';
import {
  TRANSACTIONS_REPOSITORY,
  type TransactionsRepository,
} from '../transactions/transactions.repository.js';
import { buildPlan } from './budget-plan.js';
import {
  CATEGORIES_REPOSITORY,
  type CategoriesRepository,
} from '../categories/categories.repository.js';
import { parseBudgetGrid } from './budget-sheet.js';
import { readBudgetSheet, WorkbookReadError } from './read-workbook.js';

@Injectable()
export class BudgetImportService {
  private readonly logger = new Logger(BudgetImportService.name);

  constructor(
    @Inject(CATEGORIES_REPOSITORY) private readonly categories: CategoriesRepository,
    @Inject(INCOME_REPOSITORY) private readonly income: IncomeRepository,
    @Inject(TRANSACTIONS_REPOSITORY) private readonly transactions: TransactionsRepository,
    private readonly clock: Clock,
  ) {}

  /** Reads the workbook and says what it contains. Nothing is saved. */
  async preview(userId: string, file: Buffer, year: number): Promise<BudgetImportPreviewResponse> {
    const { preview } = await this.read(userId, file, year);
    return preview;
  }

  /**
   * Saves what the user confirmed. Everything is checked first, so a refused import saves nothing.
   * A month that already has expenses is never imported over (that would double it).
   */
  async commit(
    userId: string,
    file: Buffer,
    year: number,
    decisions: BudgetImportDecisions,
  ): Promise<BudgetImportCommitResponse> {
    const { preview, usable } = await this.read(userId, file, year);
    const currentMonth = this.clock.now().toISOString().slice(0, 7);
    const plan = buildPlan(preview, decisions, currentMonth, (id) => usable.has(id));
    const invalid = (details: Record<string, string>) =>
      new ApiException(
        HttpStatus.BAD_REQUEST,
        ErrorCode.ValidationFailed,
        'Some fields are invalid.',
        details,
      );
    if (Object.keys(plan.problems).length > 0) throw invalid(plan.problems);

    const months = [...new Set(plan.expenses.map((e) => e.occurredOn.slice(0, 7)))].sort();
    const used: string[] = [];
    for (const month of months) {
      if ((await this.transactions.sumMonth(userId, month)) > 0) used.push(month);
    }
    if (used.length > 0) {
      throw new ApiException(
        HttpStatus.CONFLICT,
        ErrorCode.Conflict,
        `These months already have expenses: ${used.join(', ')}. Importing would count them twice.`,
      );
    }

    for (const row of plan.income) await this.income.create(userId, row);
    for (const row of plan.expenses) await this.transactions.create(userId, row);
    this.logger.log(
      `Budget import saved: ${plan.income.length} income and ${plan.expenses.length} expenses`,
    );
    return {
      year,
      incomeCreated: plan.income.length,
      expensesCreated: plan.expenses.length,
      incomeTotalMkd: plan.incomeTotalMkd,
      expensesTotalMkd: plan.expensesTotalMkd,
    };
  }

  private async read(
    userId: string,
    file: Buffer,
    year: number,
  ): Promise<{ preview: BudgetImportPreviewResponse; usable: Set<string> }> {
    let grid;
    try {
      grid = await readBudgetSheet(file);
    } catch (error) {
      if (error instanceof WorkbookReadError) {
        throw new ApiException(HttpStatus.BAD_REQUEST, ErrorCode.ValidationFailed, error.message, {
          file: error.message,
        });
      }
      throw error;
    }
    const parsed = parseBudgetGrid(grid, year);

    // A line is matched to a category only when exactly one active category has that name.
    const { groups } = await this.categories.list(userId, false);
    const usable = new Set(groups.flatMap((g) => g.categories.map((c) => c.id)));
    const byName = new Map<string, { id: string; name: string }[]>();
    for (const category of groups.flatMap((g) => g.categories)) {
      const list = byName.get(category.name.toLowerCase()) ?? [];
      list.push({ id: category.id, name: category.name });
      byName.set(category.name.toLowerCase(), list);
    }
    for (const line of parsed.expenses) {
      const found = byName.get(line.name.toLowerCase());
      if (found?.length === 1) {
        line.suggestedCategoryId = found[0]!.id;
        line.suggestedCategoryName = found[0]!.name;
      }
    }

    this.logger.log(
      `Budget import preview: ${parsed.income.length} income and ${parsed.expenses.length} expense lines`,
    );
    return { preview: { year, sheetName: 'Буџет', ...parsed }, usable };
  }
}
