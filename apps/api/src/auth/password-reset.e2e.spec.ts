import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { E2eHarness } from '../testing/e2e.js';

// Needs a migrated PostgreSQL database (CI provides one). Skipped when DATABASE_URL is unset.
describe.skipIf(!process.env.DATABASE_URL)('password reset', () => {
  const e2e = new E2eHarness('@reset-test.example');
  beforeAll(() => e2e.start());
  afterAll(() => e2e.stop());

  it('answers the same for a known and an unknown email', async () => {
    const user = await e2e.newUser();
    const email = (await e2e.prisma.user.findUniqueOrThrow({ where: { id: user.id } })).email;
    const known = await e2e.http().post('/api/v1/auth/password-reset/request').send({ email });
    const unknown = await e2e
      .http()
      .post('/api/v1/auth/password-reset/request')
      .send({ email: 'nobody@reset-test.example' });
    expect(known.status).toBe(204);
    expect(unknown.status).toBe(204);
  });

  it('rejects a link that does not exist', async () => {
    const res = await e2e
      .http()
      .post('/api/v1/auth/password-reset/confirm')
      .send({ token: 'x'.repeat(43), password: 'a-long-new-password' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('rejects a weak new password', async () => {
    const res = await e2e
      .http()
      .post('/api/v1/auth/password-reset/confirm')
      .send({ token: 'x'.repeat(43), password: 'short' });
    expect(res.status).toBe(400);
  });
});
