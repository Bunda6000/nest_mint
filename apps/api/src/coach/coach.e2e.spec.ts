import type { CoachAnswerResponse } from '@nestmint/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { E2eHarness } from '../testing/e2e.js';

// Needs a migrated PostgreSQL database (CI provides one). Skipped when DATABASE_URL is unset.
describe.skipIf(!process.env.DATABASE_URL)('coach', () => {
  const e2e = new E2eHarness('@coach-test.example');
  beforeAll(() => e2e.start());
  afterAll(() => e2e.stop());

  it('needs a login', async () => {
    await e2e.http().post('/api/v1/coach/ask').send({ question: 'hi' }).expect(401);
  });

  it('rejects an empty question', async () => {
    const user = await e2e.newUser();
    await e2e.post('/coach/ask', user, { question: ' ' }).expect(400);
  });

  it('says honestly when there is no data yet', async () => {
    const user = await e2e.newUser();
    const body = (await e2e.post('/coach/ask', user, { question: 'How can I save?' }).expect(200))
      .body as CoachAnswerResponse;
    expect(body.provider).toBe('rules');
    expect(body.answer).toContain('no savings ideas yet');
    expect(body.facts).toEqual([]);
  });

  it('answers a goals question without goals', async () => {
    const user = await e2e.newUser();
    const body = (
      await e2e.post('/coach/ask', user, { question: 'Will I reach my goal?' }).expect(200)
    ).body as CoachAnswerResponse;
    expect(body.answer).toContain('no savings goals');
  });
});
