import type { BudgetImportPreviewResponse } from '@nestmint/shared';
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
});
