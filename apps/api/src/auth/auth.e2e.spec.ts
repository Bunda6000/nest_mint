import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ErrorCode } from '@nestmint/shared';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from '../app.module.js';
import { configureApp } from '../app.setup.js';
import { PrismaService } from '../prisma/prisma.service.js';

const DOMAIN = '@register-test.example';

// Needs a migrated PostgreSQL database (CI provides one). Skipped when DATABASE_URL is unset.
describe.skipIf(!process.env.DATABASE_URL)('POST /api/v1/auth/register', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await prisma.user.deleteMany({ where: { email: { endsWith: DOMAIN } } });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { endsWith: DOMAIN } } });
    await app.close();
  });

  const register = (body: object) =>
    request(app.getHttpServer()).post('/api/v1/auth/register').send(body);

  it('creates the user with a normalised email and a hashed password', async () => {
    const response = await register({
      email: ' Filip@Register-Test.example ',
      password: 'correct-horse-battery',
      displayName: 'Filip',
    }).expect(201);

    expect(response.body).toEqual({
      id: expect.any(String),
      email: 'filip@register-test.example',
      displayName: 'Filip',
    });
    const row = await prisma.user.findUniqueOrThrow({
      where: { email: 'filip@register-test.example' },
    });
    expect(row.passwordHash.startsWith('$argon2id$')).toBe(true);
    expect(row.baseCurrency).toBe('MKD');
  });

  it('returns 409 for an existing email, ignoring letter case', async () => {
    await register({
      email: 'filip@register-test.example',
      password: 'correct-horse-battery',
    }).expect(201);
    const response = await register({
      email: 'FILIP@register-test.example',
      password: 'another-password-1',
    }).expect(409);

    expect(response.body.error.code).toBe(ErrorCode.EmailAlreadyRegistered);
    expect(response.body.error.details.email).toBeDefined();
  });

  it('returns 400 with one message per invalid field', async () => {
    const response = await register({ email: 'nope', password: 'short' }).expect(400);

    expect(response.body).toEqual({
      error: {
        code: ErrorCode.ValidationFailed,
        message: 'Some fields are invalid.',
        details: {
          email: 'Enter a valid email address',
          password: 'Password must be at least 10 characters',
        },
      },
    });
  });
});
