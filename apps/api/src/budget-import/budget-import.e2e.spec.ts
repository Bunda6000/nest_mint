import type { BudgetImportPreviewResponse, CategoriesResponse } from '@nestmint/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { E2eHarness } from '../testing/e2e.js';
import { sampleWorkbook } from './budget-sheet.test-data.js';

// Needs a migrated PostgreSQL database (CI provides one). Skipped when DATABASE_URL is unset.
describe.skipIf(!process.env.DATABASE_URL)('budget import preview', () => {
  const e2e = new E2eHarness('@import-test.example');

  beforeAll(() => e2e.start());
  afterAll(() => e2e.stop());

  it('refuses an upload without a login', async () => {
    await e2e.http().post('/api/v1/imports/budget/preview').expect(401);
  });

  it('previews an uploaded workbook and saves nothing', async () => {
    const user = await e2e.newUser();
    const upload = (year: string, file: Buffer | null) => {
      const req = e2e
        .http()
        .post('/api/v1/imports/budget/preview')
        .set('Authorization', `Bearer ${user.token}`)
        .field('year', year);
      return file ? req.attach('file', file, 'Budget.xlsx') : req;
    };

    const ok = await upload('2025', await sampleWorkbook()).expect(200);
    const preview = ok.body as BudgetImportPreviewResponse;
    expect(preview).toMatchObject({ year: 2025, incomeTotalMkd: 400_484, warnings: [] });
    expect(preview.expenses.map((l) => l.name)).toEqual(['Станбен', 'Кеш', 'Гориво']);

    await upload('2025', null).expect(400);
    await upload('1999', await sampleWorkbook()).expect(400);
    await upload('2025', Buffer.from('nope')).expect(400);

    const income = (await e2e.get('/income', user).expect(200)).body as { incomes: unknown[] };
    expect(income.incomes).toEqual([]);
  });

  it('commits a reviewed import once, and refuses a second one over the same months', async () => {
    const user = await e2e.newUser();
    const { groups } = (await e2e.get('/categories', user).expect(200)).body as CategoriesResponse;
    const categoryId = groups[0]!.categories[0]!.id;
    const decisions = {
      lines: {
        'Банки|Станбен': { categoryId },
        'Банки|Кеш': { skip: true },
        'Транспорт|Гориво': { categoryId },
      },
      fixes: [
        { lineKey: 'Банки|Станбен', month: '2025-02', amountMkd: 15_400 },
        { lineKey: 'Транспорт|Гориво', month: '2025-02', amountMkd: 0 },
      ],
    };
    const commit = async (d: object) =>
      e2e
        .http()
        .post('/api/v1/imports/budget/commit')
        .set('Authorization', `Bearer ${user.token}`)
        .field('year', '2025')
        .field('decisions', JSON.stringify(d))
        .attach('file', await sampleWorkbook(), 'Budget.xlsx');

    await commit({ ...decisions, fixes: [] }).then((r) => expect(r.status).toBe(400));
    const ok = await commit(decisions);
    expect(ok.status).toBe(201);
    expect(ok.body).toMatchObject({
      incomeCreated: 2,
      expensesCreated: 4,
      incomeTotalMkd: 400_484,
      expensesTotalMkd: 15_437 + 15_400 + 15_500 + 4_200,
    });
    const march = (await e2e.get('/summary?month=2025-03', user).expect(200)).body as {
      incomeMkd: number;
      expensesMkd: number;
    };
    expect(march).toMatchObject({ incomeMkd: 127_088 + 0, expensesMkd: 15_500 });
    expect((await commit(decisions)).status).toBe(409);
  });
});
