import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { CategoriesResponse, SessionResponse } from '@nestmint/shared';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../app.module.js';
import { configureApp } from '../app.setup.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CATEGORIES_REPOSITORY, type CategoriesRepository } from './categories.repository.js';
import { DEFAULT_CATEGORY_GROUPS } from './categories.seed.js';

const DOMAIN = '@categories-test.example';
const PASSWORD = 'correct-horse-battery';
const SEEDED_CATEGORY_COUNT = DEFAULT_CATEGORY_GROUPS.reduce((n, g) => n + g.categories.length, 0);

// Needs a migrated PostgreSQL database (CI provides one). Skipped when DATABASE_URL is unset.
describe.skipIf(!process.env.DATABASE_URL)('categories and user data isolation', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let counter = 0;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { endsWith: DOMAIN } } });
    await app.close();
  });

  const http = () => request(app.getHttpServer());

  /** Registers and logs in a fresh user. Reuse this helper for every user-data endpoint's isolation test. */
  async function newUser() {
    const email = `user${++counter}-${Date.now()}${DOMAIN}`;
    await http().post('/api/v1/auth/register').send({ email, password: PASSWORD }).expect(201);
    const login = await http().post('/api/v1/auth/login').send({ email, password: PASSWORD });
    const session = login.body as SessionResponse;
    return { id: session.user.id, token: session.accessToken };
  }

  const getCategories = (token: string) =>
    http().get('/api/v1/categories').set('Authorization', `Bearer ${token}`);

  const idsOf = (tree: CategoriesResponse) =>
    tree.groups.flatMap((g) => [g.id, ...g.categories.map((c) => c.id)]);

  it('requires a login', async () => {
    await http().get('/api/v1/categories').expect(401);
  });

  it('gives a new user the default categories in order, including the spreadsheet groups', async () => {
    const user = await newUser();
    const response = await getCategories(user.token).expect(200);
    const tree = response.body as CategoriesResponse;

    expect(tree.groups.map((g) => g.name)).toEqual(DEFAULT_CATEGORY_GROUPS.map((g) => g.name));
    for (const [i, group] of DEFAULT_CATEGORY_GROUPS.entries()) {
      expect(tree.groups[i]!.categories.map((c) => c.name)).toEqual(group.categories);
    }
  });

  it('creates the defaults exactly once even when the first requests arrive together', async () => {
    const user = await newUser();
    const responses = await Promise.all(Array.from({ length: 6 }, () => getCategories(user.token)));

    expect(responses.map((r) => r.status)).toEqual(Array(6).fill(200));
    expect(await prisma.categoryGroup.count({ where: { userId: user.id } })).toBe(
      DEFAULT_CATEGORY_GROUPS.length,
    );
    expect(await prisma.category.count({ where: { userId: user.id } })).toBe(SEEDED_CATEGORY_COUNT);
  });

  it('seeds exactly once when several seeding calls overlap (the race itself, not just requests)', async () => {
    const user = await newUser();
    const repository = app.get<CategoriesRepository>(CATEGORIES_REPOSITORY);

    await Promise.all(
      Array.from({ length: 8 }, () =>
        repository.seedDefaultsOnce(user.id, DEFAULT_CATEGORY_GROUPS, new Date()),
      ),
    );

    expect(await prisma.categoryGroup.count({ where: { userId: user.id } })).toBe(
      DEFAULT_CATEGORY_GROUPS.length,
    );
    expect(await prisma.category.count({ where: { userId: user.id } })).toBe(SEEDED_CATEGORY_COUNT);
  });

  it("never lets one user see another user's categories", async () => {
    const alice = await newUser();
    const bob = await newUser();

    const aliceTree = (await getCategories(alice.token).expect(200)).body as CategoriesResponse;
    const bobTree = (await getCategories(bob.token).expect(200)).body as CategoriesResponse;

    expect(aliceTree.groups).toHaveLength(DEFAULT_CATEGORY_GROUPS.length);
    expect(bobTree.groups).toHaveLength(DEFAULT_CATEGORY_GROUPS.length);
    expect(idsOf(aliceTree).filter((id) => idsOf(bobTree).includes(id))).toEqual([]);

    const aliceRows = await prisma.category.findMany({ where: { id: { in: idsOf(aliceTree) } } });
    expect(aliceRows.every((row) => row.userId === alice.id)).toBe(true);
  });

  it("is enforced by the database: a category cannot point at another user's group", async () => {
    const alice = await newUser();
    const bob = await newUser();
    await getCategories(alice.token).expect(200);
    const aliceGroup = await prisma.categoryGroup.findFirstOrThrow({ where: { userId: alice.id } });

    await expect(
      prisma.category.create({
        data: {
          id: randomUUID(),
          userId: bob.id,
          groupId: aliceGroup.id,
          name: 'Sneaky',
          sortOrder: 0,
        },
      }),
    ).rejects.toMatchObject({ code: 'P2003' });
  });

  it('does not bring deleted categories back', async () => {
    const user = await newUser();
    await getCategories(user.token).expect(200);
    await prisma.category.deleteMany({ where: { userId: user.id, name: 'Groceries' } });

    const tree = (await getCategories(user.token).expect(200)).body as CategoriesResponse;
    expect(tree.groups.flatMap((g) => g.categories.map((c) => c.name))).not.toContain('Groceries');
    expect(await prisma.category.count({ where: { userId: user.id } })).toBe(
      SEEDED_CATEGORY_COUNT - 1,
    );
  });

  it('removes the categories together with the user', async () => {
    const user = await newUser();
    await getCategories(user.token).expect(200);

    await prisma.user.delete({ where: { id: user.id } });

    expect(await prisma.categoryGroup.count({ where: { userId: user.id } })).toBe(0);
    expect(await prisma.category.count({ where: { userId: user.id } })).toBe(0);
  });
});
