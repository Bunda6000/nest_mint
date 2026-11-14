import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { type BudgetImportPreviewResponse, ErrorCode } from '@nestmint/shared';
import { ApiException } from '../common/api.exception.js';
import {
  CATEGORIES_REPOSITORY,
  type CategoriesRepository,
} from '../categories/categories.repository.js';
import { parseBudgetGrid } from './budget-sheet.js';
import { readBudgetSheet, WorkbookReadError } from './read-workbook.js';

@Injectable()
export class BudgetImportService {
  private readonly logger = new Logger(BudgetImportService.name);

  constructor(@Inject(CATEGORIES_REPOSITORY) private readonly categories: CategoriesRepository) {}

  /** Reads the workbook and says what it contains. Nothing is saved. */
  async preview(userId: string, file: Buffer, year: number): Promise<BudgetImportPreviewResponse> {
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
    return { year, sheetName: 'Буџет', ...parsed };
  }
}
