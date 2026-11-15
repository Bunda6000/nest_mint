import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: {
    // Migrations need a session-mode connection (the pooler on port 6543 cannot take their lock),
    // so DIRECT_URL, when set, is used here while the running API uses DATABASE_URL.
    url:
      process.env.DIRECT_URL ??
      process.env.DATABASE_URL ??
      'postgresql://nestmint:nestmint@localhost:5432/nestmint',
  },
});
