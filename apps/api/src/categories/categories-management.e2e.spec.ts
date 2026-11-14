import type { CategoriesResponse, CategoryGroupResponse } from '@nestmint/shared';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type E2eUser, E2eHarness } from '../testing/e2e.js';
import { DEFAULT_CATEGORY_GROUPS } from './categories.seed.js';

// Needs a migrated PostgreSQL database (CI provides one). Skipped when DATABASE_URL is unset.
describe.skipIf(!process.env.DATABASE_URL)('managing categories', () => {
  const e2e = new E2eHarness('@categories-manage-test.example');

  beforeAll(() => e2e.start());
  afterAll(() => e2e.stop());

  async function tree(user: E2eUser, archived = false): Promise<CategoryGroupResponse[]> {
    const response = await e2e
      .get(`/categories${archived ? '?includeArchived=true' : ''}`, user)
      .expect(200);
    return (response.body as CategoriesResponse).groups;
  }

  async function group(
    user: E2eUser,
    name: string,
    archived = true,
  ): Promise<CategoryGroupResponse> {
    const found = (await tree(user, archived)).find((g) => g.name === name);
    if (!found) throw new Error(`No group ${name}`);
    return found;
  }

  const errorCode = (body: unknown) => (body as { error: { code: string } }).error.code;

  describe('login', () => {
    it('is required by every endpoint', async () => {
      const id = randomUUID();
      const requests = [
        e2e.http().post('/api/v1/categories/groups').send({ name: 'x' }),
        e2e.http().post('/api/v1/categories').send({ groupId: id, name: 'x' }),
        e2e.http().patch(`/api/v1/categories/groups/${id}`).send({ name: 'x' }),
        e2e.http().patch(`/api/v1/categories/${id}`).send({ name: 'x' }),
        e2e
          .http()
          .put('/api/v1/categories/groups/order')
          .send({ ids: [id] }),
        e2e
          .http()
          .put(`/api/v1/categories/groups/${id}/order`)
          .send({ ids: [id] }),
      ];
      for (const response of await Promise.all(requests)) expect(response.status).toBe(401);
    });
  });

  describe('creating', () => {
    it('adds a group at the end and a category at the end of its group', async () => {
      const user = await e2e.newUser();

      const created = await e2e.post('/categories/groups', user, { name: '  Pets ' }).expect(201);
      expect(created.body).toMatchObject({ name: 'Pets', archived: false });
      const groups = await tree(user);
      expect(groups.at(-1)!.name).toBe('Pets');

      const category = await e2e
        .post('/categories', user, { groupId: created.body.id, name: 'Vet' })
        .expect(201);
      expect(category.body).toMatchObject({
        groupId: created.body.id,
        name: 'Vet',
        archived: false,
      });
      await e2e.post('/categories', user, { groupId: created.body.id, name: 'Food' }).expect(201);

      const pets = await group(user, 'Pets', false);
      expect(pets.categories.map((c) => c.name)).toEqual(['Vet', 'Food']);
    });

    it('validates the body', async () => {
      const user = await e2e.newUser();
      const blank = await e2e.post('/categories/groups', user, { name: '   ' }).expect(400);
      expect(errorCode(blank.body)).toBe('VALIDATION_FAILED');
      await e2e.post('/categories/groups', user, { name: 'x'.repeat(61) }).expect(400);
      await e2e.post('/categories', user, { groupId: 'nope', name: 'x' }).expect(400);
    });

    it('refuses a name that is taken, ignoring capital letters', async () => {
      const user = await e2e.newUser();
      const banks = await group(user, 'Banks');

      const dup = await e2e.post('/categories/groups', user, { name: 'banks' }).expect(409);
      expect(errorCode(dup.body)).toBe('NAME_TAKEN');
      const dupCategory = await e2e
        .post('/categories', user, { groupId: banks.id, name: 'MORTGAGE' })
        .expect(409);
      expect(errorCode(dupCategory.body)).toBe('NAME_TAKEN');
    });

    it('seeds the defaults first, so even a first request cannot clash with them', async () => {
      const user = await e2e.newUser();
      const response = await e2e.post('/categories/groups', user, { name: 'Banks' }).expect(409);
      expect(errorCode(response.body)).toBe('NAME_TAKEN');
      expect((await tree(user)).length).toBe(DEFAULT_CATEGORY_GROUPS.length);
    });

    it('refuses to add to an archived group', async () => {
      const user = await e2e.newUser();
      const food = await group(user, 'Food');
      await e2e.patch(`/categories/groups/${food.id}`, user, { archived: true }).expect(200);
      const response = await e2e
        .post('/categories', user, { groupId: food.id, name: 'Snacks' })
        .expect(409);
      expect(errorCode(response.body)).toBe('CONFLICT');
    });
  });

  describe('renaming', () => {
    it('renames a group and a category, and refuses a taken name', async () => {
      const user = await e2e.newUser();
      const home = await group(user, 'Home');
      const water = home.categories.find((c) => c.name === 'Water')!;

      await e2e.patch(`/categories/groups/${home.id}`, user, { name: 'House' }).expect(200);
      await e2e.patch(`/categories/${water.id}`, user, { name: 'Water bill' }).expect(200);
      const house = await group(user, 'House', false);
      expect(house.categories.map((c) => c.name)).toContain('Water bill');

      const taken = await e2e
        .patch(`/categories/${water.id}`, user, { name: 'electricity' })
        .expect(409);
      expect(errorCode(taken.body)).toBe('NAME_TAKEN');
      await e2e.patch(`/categories/groups/${home.id}`, user, {}).expect(400);
    });
  });

  describe('archiving and restoring', () => {
    it('keeps archived categories in the database and out of the normal list', async () => {
      const user = await e2e.newUser();
      const home = await group(user, 'Home');
      const heating = home.categories.find((c) => c.name === 'Heating')!;
      await e2e.patch(`/categories/${heating.id}`, user, { archived: true }).expect(200);

      expect((await group(user, 'Home', false)).categories.map((c) => c.name)).not.toContain(
        'Heating',
      );
      const all = await group(user, 'Home', true);
      expect(all.categories.find((c) => c.name === 'Heating')).toMatchObject({ archived: true });
      expect(await e2e.prisma.category.count({ where: { id: heating.id } })).toBe(1);
    });

    it('archives a group with its categories; restoring the group does not restore them', async () => {
      const user = await e2e.newUser();
      const food = await group(user, 'Food');
      await e2e.patch(`/categories/groups/${food.id}`, user, { archived: true }).expect(200);

      expect((await tree(user)).map((g) => g.name)).not.toContain('Food');
      const archived = await group(user, 'Food', true);
      expect(archived.archived).toBe(true);
      expect(archived.categories.every((c) => c.archived)).toBe(true);

      // A category cannot come back while its group is archived.
      const blocked = await e2e
        .patch(`/categories/${food.categories[0]!.id}`, user, { archived: false })
        .expect(409);
      expect(errorCode(blocked.body)).toBe('CONFLICT');

      await e2e.patch(`/categories/groups/${food.id}`, user, { archived: false }).expect(200);
      expect((await group(user, 'Food', false)).categories).toEqual([]);

      await e2e
        .patch(`/categories/${food.categories[0]!.id}`, user, { archived: false })
        .expect(200);
      expect((await group(user, 'Food', false)).categories.map((c) => c.name)).toEqual([
        'Groceries',
      ]);
    });

    it('puts a restored group at the end and points to the archive when its name is reused', async () => {
      const user = await e2e.newUser();
      const banks = await group(user, 'Banks');
      await e2e.patch(`/categories/groups/${banks.id}`, user, { archived: true }).expect(200);

      const reused = await e2e.post('/categories/groups', user, { name: 'Banks' }).expect(409);
      expect(errorCode(reused.body)).toBe('NAME_IN_ARCHIVE');

      await e2e.patch(`/categories/groups/${banks.id}`, user, { archived: false }).expect(200);
      expect((await tree(user)).at(-1)!.name).toBe('Banks');
    });
  });

  describe('reordering', () => {
    it('saves a new order of groups and of categories', async () => {
      const user = await e2e.newUser();
      const groups = await tree(user);
      const reversed = groups.map((g) => g.id).reverse();
      await e2e.put('/categories/groups/order', user, { ids: reversed }).expect(204);
      expect((await tree(user)).map((g) => g.id)).toEqual(reversed);

      const home = await group(user, 'Home', false);
      const ids = home.categories.map((c) => c.id);
      const rotated = [...ids.slice(1), ids[0]!];
      await e2e.put(`/categories/groups/${home.id}/order`, user, { ids: rotated }).expect(204);
      expect((await group(user, 'Home', false)).categories.map((c) => c.id)).toEqual(rotated);
    });

    it('refuses a list that does not match the active items', async () => {
      const user = await e2e.newUser();
      const ids = (await tree(user)).map((g) => g.id);
      const missing = await e2e
        .put('/categories/groups/order', user, { ids: ids.slice(1) })
        .expect(409);
      expect(errorCode(missing.body)).toBe('CONFLICT');
      await e2e.put('/categories/groups/order', user, { ids: [...ids, randomUUID()] }).expect(409);
      await e2e.put('/categories/groups/order', user, { ids: [ids[0], ids[0]] }).expect(400);
      expect((await tree(user)).map((g) => g.id)).toEqual(ids);
    });
  });

  describe("another user's data", () => {
    it('cannot be renamed, archived or reordered, and stays unchanged', async () => {
      const alice = await e2e.newUser();
      const bob = await e2e.newUser();
      const aliceBefore = await tree(alice, true);
      const home = aliceBefore.find((g) => g.name === 'Home')!;
      const water = home.categories.find((c) => c.name === 'Water')!;
      await tree(bob);

      const attempts = [
        e2e.patch(`/categories/groups/${home.id}`, bob, { name: 'Hacked' }),
        e2e.patch(`/categories/groups/${home.id}`, bob, { archived: true }),
        e2e.patch(`/categories/${water.id}`, bob, { name: 'Hacked' }),
        e2e.patch(`/categories/${water.id}`, bob, { archived: true }),
        e2e.post('/categories', bob, { groupId: home.id, name: 'Planted' }),
        e2e.put(`/categories/groups/${home.id}/order`, bob, {
          ids: home.categories.map((c) => c.id).reverse(),
        }),
      ];
      for (const response of await Promise.all(attempts)) {
        expect(response.status).toBe(404);
        expect(errorCode(response.body)).toBe('NOT_FOUND');
      }

      // Putting Alice's ids into Bob's own list changes nothing for either of them.
      const bobBefore = await tree(bob, true);
      const stolen = [...bobBefore.slice(1).map((g) => g.id), home.id];
      await e2e.put('/categories/groups/order', bob, { ids: stolen }).expect(409);
      await e2e
        .put('/categories/groups/order', bob, { ids: aliceBefore.map((g) => g.id) })
        .expect(409);

      expect(await tree(alice, true)).toEqual(aliceBefore);
      expect(await tree(bob, true)).toEqual(bobBefore);
    });

    it('treats an id that is not a UUID as not found', async () => {
      const user = await e2e.newUser();
      await e2e.patch('/categories/groups/not-a-uuid', user, { name: 'x' }).expect(404);
      await e2e.patch('/categories/123', user, { name: 'x' }).expect(404);
      await e2e.put('/categories/groups/nope/order', user, { ids: [randomUUID()] }).expect(404);
    });

    it('lets two users have the same names', async () => {
      const alice = await e2e.newUser();
      const bob = await e2e.newUser();
      await e2e.post('/categories/groups', alice, { name: 'Pets' }).expect(201);
      await e2e.post('/categories/groups', bob, { name: 'Pets' }).expect(201);
    });
  });

  describe('moving and merging', () => {
    const categoryOf = async (user: E2eUser, name: string) =>
      (await tree(user, true)).flatMap((g) => g.categories).find((c) => c.name === name)!;

    it('moves a category and keeps its expenses', async () => {
      const user = await e2e.newUser();
      const groceries = await categoryOf(user, 'Groceries');
      await e2e
        .post('/transactions', user, {
          categoryId: groceries.id,
          amountMkd: 500,
          occurredOn: '2026-11-02',
        })
        .expect(201);
      const pets = (await e2e.post('/categories/groups', user, { name: 'Pets' }).expect(201))
        .body as { id: string };

      const moved = await e2e
        .patch(`/categories/${groceries.id}`, user, { groupId: pets.id })
        .expect(200);
      expect(moved.body).toMatchObject({ id: groceries.id, groupId: pets.id });
      const usage = await e2e.get(`/categories/${groceries.id}/usage`, user).expect(200);
      expect(usage.body).toEqual({ transactions: 1, obligations: 0 });
    });

    it('merges two categories: expenses and bills move, the source is archived', async () => {
      const user = await e2e.newUser();
      const source = await categoryOf(user, 'Groceries');
      const target = await categoryOf(user, 'Restaurants');
      await e2e
        .post('/transactions', user, {
          categoryId: source.id,
          amountMkd: 700,
          occurredOn: '2026-11-03',
        })
        .expect(201);
      await e2e
        .post('/obligations', user, {
          recurrence: 'monthly',
          name: 'Veggie box',
          categoryId: source.id,
          expectedAmountMkd: 1_000,
          dueDay: 5,
          startMonth: '2026-11',
        })
        .expect(201);

      const result = await e2e
        .post(`/categories/${source.id}/merge`, user, { targetCategoryId: target.id })
        .expect(200);
      expect(result.body).toMatchObject({ transactions: 1, obligations: 1 });
      expect(await e2e.get(`/categories/${target.id}/usage`, user).then((r) => r.body)).toEqual({
        transactions: 1,
        obligations: 1,
      });
      expect((await categoryOf(user, 'Groceries')).archived).toBe(true);
    });

    it('does not reach other users', async () => {
      const alice = await e2e.newUser();
      const bob = await e2e.newUser();
      const mine = await categoryOf(alice, 'Groceries');
      const hers = await categoryOf(bob, 'Restaurants');
      await e2e
        .post(`/categories/${mine.id}/merge`, alice, { targetCategoryId: hers.id })
        .expect(404);
      await e2e.get(`/categories/${mine.id}/usage`, bob).expect(404);
      await e2e
        .patch(`/categories/${mine.id}`, alice, { groupId: (await tree(bob))[0]!.id })
        .expect(404);
    });
  });
});
