import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from './prisma.service.js';

// Guards against tables exposed through Supabase's public data API.
describe.skipIf(!process.env.DATABASE_URL)('Row Level Security', () => {
  let prisma: PrismaService;

  beforeAll(() => {
    prisma = new PrismaService();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('is enabled on every table in the public schema', async () => {
    const unprotected = await prisma.$queryRaw<{ tablename: string }[]>`
      SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND NOT rowsecurity`;
    expect(unprotected.map((t) => t.tablename)).toEqual([]);
  });
});
