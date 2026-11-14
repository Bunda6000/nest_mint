import type { ExchangeRatesResponse } from '@nestmint/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { E2eHarness } from '../testing/e2e.js';

// Needs a migrated PostgreSQL database (CI provides one). Skipped when DATABASE_URL is unset.
describe.skipIf(!process.env.DATABASE_URL)('exchange rates', () => {
  const e2e = new E2eHarness('@rates-test.example');

  beforeAll(() => e2e.start());
  afterAll(() => e2e.stop());

  it('refuses the endpoints without a login', async () => {
    await e2e.http().get('/api/v1/settings/rates').expect(401);
  });

  it('saves, replaces, lists and deletes rates for one user only', async () => {
    const user = await e2e.newUser();
    const other = await e2e.newUser();
    await e2e.put('/settings/rates/2026-06-01', user, { mkdPerEur: 61.7 }).expect(200);
    await e2e.put('/settings/rates/2026-06-01', user, { mkdPerEur: 61.6234 }).expect(200);
    await e2e.put('/settings/rates/2026-01-01', user, { mkdPerEur: 61.5 }).expect(200);

    const list = (await e2e.get('/settings/rates', user).expect(200)).body as ExchangeRatesResponse;
    expect(list.rates).toEqual([
      { effectiveFrom: '2026-01-01', mkdPerEur: 61.5 },
      { effectiveFrom: '2026-06-01', mkdPerEur: 61.6234 },
    ]);
    expect(
      ((await e2e.get('/settings/rates', other).expect(200)).body as ExchangeRatesResponse).rates,
    ).toEqual([]);

    await e2e.put('/settings/rates/2026-06-01', user, { mkdPerEur: 61.12345 }).expect(400);
    await e2e.put('/settings/rates/2026-06-01', user, { mkdPerEur: 0 }).expect(400);
    await e2e.put('/settings/rates/not-a-day', user, { mkdPerEur: 61 }).expect(400);
    await e2e.delete('/settings/rates/2026-06-01', other).expect(404);
    await e2e.delete('/settings/rates/2026-06-01', user).expect(204);
  });
});
