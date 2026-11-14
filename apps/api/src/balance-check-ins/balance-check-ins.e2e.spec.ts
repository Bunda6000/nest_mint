import type { BalanceCheckInResponse, BalanceCheckInStatusResponse } from '@nestmint/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { E2eHarness } from '../testing/e2e.js';

// Needs a migrated PostgreSQL database (CI provides one). Skipped when DATABASE_URL is unset.
describe.skipIf(!process.env.DATABASE_URL)('balance check-ins', () => {
  const e2e = new E2eHarness('@checkin-test.example');

  beforeAll(() => e2e.start());
  afterAll(() => e2e.stop());

  it('refuses the endpoints without a login', async () => {
    await e2e.http().get('/api/v1/balance-check-ins?month=2026-10').expect(401);
    await e2e.http().put('/api/v1/balance-check-ins/2026-10').send({}).expect(401);
  });

  it('saves, reads back, replaces and keeps users apart', async () => {
    const user = await e2e.newUser();
    const other = await e2e.newUser();
    await e2e
      .post('/income', user, {
        name: 'Salary',
        amountMkd: 100_000,
        recurrence: 'monthly',
        startMonth: '2026-01',
        payDay: 5,
      })
      .expect(201);

    const before = (await e2e.get('/balance-check-ins?month=2026-10', user).expect(200))
      .body as BalanceCheckInStatusResponse;
    expect(before).toEqual({ month: '2026-10', checkIn: null, needsOpening: true });

    await e2e.put('/balance-check-ins/2026-10', user, { closingBalanceMkd: 1 }).expect(400);

    const saved = (
      await e2e
        .put('/balance-check-ins/2026-10', user, {
          openingBalanceMkd: 0,
          closingBalanceMkd: 85_000,
        })
        .expect(200)
    ).body as BalanceCheckInResponse;
    expect(saved).toMatchObject({ incomeMkd: 100_000, untrackedMkd: 15_000, alert: true });

    const replaced = (
      await e2e.put('/balance-check-ins/2026-10', user, { closingBalanceMkd: 100_000 }).expect(200)
    ).body as BalanceCheckInResponse;
    expect(replaced).toMatchObject({ untrackedMkd: 0, alert: false });

    const after = (await e2e.get('/balance-check-ins?month=2026-10', user).expect(200))
      .body as BalanceCheckInStatusResponse;
    expect(after.checkIn).toMatchObject({ closingMkd: 100_000 });

    const theirs = (await e2e.get('/balance-check-ins?month=2026-10', other).expect(200))
      .body as BalanceCheckInStatusResponse;
    expect(theirs.checkIn).toBeNull();
  });
});
