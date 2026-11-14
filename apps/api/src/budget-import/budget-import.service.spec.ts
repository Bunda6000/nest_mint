import { HttpException } from '@nestjs/common';
import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_CATEGORY_GROUPS } from '../categories/categories.seed.js';
import { InMemoryCategories } from '../testing/fakes.js';
import { BudgetImportService } from './budget-import.service.js';
import { sampleWorkbook } from './budget-sheet.test-data.js';

let categories: InMemoryCategories;
let service: BudgetImportService;

beforeEach(async () => {
  categories = new InMemoryCategories();
  await categories.seedDefaultsOnce('u', DEFAULT_CATEGORY_GROUPS);
  service = new BudgetImportService(categories);
});

describe('budget import preview', () => {
  it('reads a real workbook, including formula results', async () => {
    const preview = await service.preview('u', await sampleWorkbook(), 2025);
    expect(preview.incomeTotalMkd).toBe(400_484);
    expect(preview.expenses).toHaveLength(3);
    expect(preview.warnings).toEqual([]);
  });

  it('suggests a category only when exactly one has the same name', async () => {
    const group = (await categories.list('u', false)).groups[0]!;
    const name = group.categories[0]!.name;
    const preview = await service.preview('u', await sampleWorkbook(), 2025);
    expect(preview.expenses.every((l) => l.suggestedCategoryId === null)).toBe(true);
    expect(name.length).toBeGreaterThan(0);
  });

  it('refuses a file that is not a workbook and a workbook without the sheet', async () => {
    const status = async (p: Promise<unknown>) => {
      try {
        await p;
      } catch (error) {
        return (error as HttpException).getStatus();
      }
      return 200;
    };
    expect(await status(service.preview('u', Buffer.from('not excel'), 2025))).toBe(400);
    expect(await status(service.preview('u', await sampleWorkbook('Other'), 2025))).toBe(400);
  });
});
