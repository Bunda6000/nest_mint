import { HttpException } from '@nestjs/common';
import type { BudgetImportDecisions } from '@nestmint/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_CATEGORY_GROUPS } from '../categories/categories.seed.js';
import { FakeClock, InMemoryCategories } from '../testing/fakes.js';
import { InMemoryIncome } from '../testing/income-fake.js';
import { InMemoryTransactions } from '../testing/transactions-fake.js';
import { BudgetImportService } from './budget-import.service.js';
import { sampleWorkbook } from './budget-sheet.test-data.js';

const U = 'u';
let categories: InMemoryCategories;
let income: InMemoryIncome;
let transactions: InMemoryTransactions;
let service: BudgetImportService;
let categoryId: string;

beforeEach(async () => {
  categories = new InMemoryCategories();
  await categories.seedDefaultsOnce(U, DEFAULT_CATEGORY_GROUPS);
  categoryId = (await categories.list(U, false)).groups[0]!.categories[0]!.id;
  income = new InMemoryIncome();
  transactions = new InMemoryTransactions(() => 'Cat');
  service = new BudgetImportService(categories, income, transactions, new FakeClock()); // 2026-11-08
});

const status = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (error) {
    return (error as HttpException).getStatus();
  }
  return 200;
};

const decisions = (over: Partial<BudgetImportDecisions> = {}): BudgetImportDecisions => ({
  lines: {
    'Банки|Станбен': { categoryId },
    'Банки|Кеш': { categoryId },
    'Транспорт|Гориво': { categoryId },
  },
  fixes: [
    { lineKey: 'Банки|Станбен', month: '2025-02', amountMkd: 15_400 },
    { lineKey: 'Транспорт|Гориво', month: '2025-02', amountMkd: 0 },
  ],
  ...over,
});

describe('budget import preview', () => {
  it('reads a real workbook, including formula results', async () => {
    const preview = await service.preview(U, await sampleWorkbook(), 2025);
    expect(preview.incomeTotalMkd).toBe(400_484);
    expect(preview.expenses).toHaveLength(3);
    expect(preview.warnings).toEqual([]);
    expect(preview.anomalies).toHaveLength(2);
  });

  it('refuses a file that is not a workbook and a workbook without the sheet', async () => {
    expect(await status(service.preview(U, Buffer.from('not excel'), 2025))).toBe(400);
    expect(await status(service.preview(U, await sampleWorkbook('Other'), 2025))).toBe(400);
  });
});

describe('budget import commit', () => {
  it('saves income and expenses so that the totals match the preview plus the fixes', async () => {
    const file = await sampleWorkbook();
    const preview = await service.preview(U, file, 2025);
    const result = await service.commit(U, file, 2025, decisions());

    expect(result.incomeTotalMkd).toBe(preview.incomeTotalMkd);
    expect(result.expensesTotalMkd).toBe(preview.expensesTotalMkd + 15_400);
    expect(result).toMatchObject({ incomeCreated: 2, expensesCreated: 5 });
    expect(await transactions.sumMonth(U, '2025-02')).toBe(15_400);
    expect(await transactions.sumMonth(U, '2025-03')).toBe(15_500);
  });

  it('makes a run of equal months a salary and everything else one-off income', async () => {
    await service.commit(U, await sampleWorkbook(), 2025, decisions());
    const saved = await income.list(U);
    const salary = saved.find((i) => i.name === 'Плата')!;
    expect(salary).toMatchObject({
      recurrence: 'monthly',
      amountMkd: 127_088,
      startMonth: '2025-01',
      endMonth: '2025-03',
    });
    expect(saved.find((i) => i.name === 'Друго')).toMatchObject({
      recurrence: 'one_off',
      receivedOn: '2025-01-01',
    });
  });

  it('refuses while a line has no category or an item is unresolved, and saves nothing', async () => {
    const file = await sampleWorkbook();
    expect(
      await status(
        service.commit(U, file, 2025, decisions({ lines: {}, fixes: decisions().fixes })),
      ),
    ).toBe(400);
    expect(await status(service.commit(U, file, 2025, decisions({ fixes: [] })))).toBe(400);
    expect(income.rows).toHaveLength(0);
    expect(transactions.rows).toHaveLength(0);
  });

  it('lets a line be skipped and refuses a category that is not the user’s', async () => {
    const file = await sampleWorkbook();
    const skipped = decisions({
      lines: {
        'Банки|Станбен': { skip: true },
        'Банки|Кеш': { skip: true },
        'Транспорт|Гориво': { categoryId },
      },
      fixes: [
        { lineKey: 'Банки|Станбен', month: '2025-02', amountMkd: 0 },
        { lineKey: 'Транспорт|Гориво', month: '2025-02', amountMkd: 0 },
      ],
    });
    expect((await service.commit(U, file, 2025, skipped)).expensesCreated).toBe(1);

    const foreign = decisions({
      lines: { ...decisions().lines, 'Банки|Кеш': { categoryId: crypto.randomUUID() } },
    });
    expect(await status(service.commit('other', file, 2025, foreign))).toBe(400);
  });

  it('refuses to import over months that already have expenses', async () => {
    await transactions.create(U, {
      kind: 'expense',
      categoryId,
      amountMkd: 100,
      occurredOn: '2025-01-10',
      note: null,
    });
    expect(await status(service.commit(U, await sampleWorkbook(), 2025, decisions()))).toBe(409);
  });

  it('refuses a year whose months have not started', async () => {
    expect(await status(service.commit(U, await sampleWorkbook(), 2027, decisions()))).toBe(400);
  });
});
