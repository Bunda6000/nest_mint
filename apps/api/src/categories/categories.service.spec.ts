import { HttpException } from '@nestjs/common';
import { ErrorCode } from '@nestmint/shared';
import { describe, expect, it } from 'vitest';
import { FakeClock, InMemoryCategories } from '../testing/fakes.js';
import { CategoriesService } from './categories.service.js';
import { DEFAULT_CATEGORY_GROUPS } from './categories.seed.js';
import { DuplicateNameError } from './categories.repository.js';

const A = 'user-a';
const B = 'user-b';

function setup() {
  const repository = new InMemoryCategories();
  return { repository, service: new CategoriesService(repository, new FakeClock()) };
}

/** Awaits a call that must fail with an API error and returns its status and code. */
async function failure(call: Promise<unknown>): Promise<{ status: number; code: string }> {
  try {
    await call;
  } catch (error) {
    if (error instanceof HttpException) {
      const body = error.getResponse() as { error: { code: string } };
      return { status: error.getStatus(), code: body.error.code };
    }
    throw error;
  }
  throw new Error('Expected the call to fail');
}

const groupNames = async (service: CategoriesService, user = A, archived = false) =>
  (await service.list(user, archived)).groups.map((g) => g.name);

async function groupId(service: CategoriesService, name: string, user = A): Promise<string> {
  const group = (await service.list(user, true)).groups.find((g) => g.name === name);
  if (!group) throw new Error(`No group ${name}`);
  return group.id;
}

async function categoryId(service: CategoriesService, name: string, user = A): Promise<string> {
  const all = (await service.list(user, true)).groups.flatMap((g) => g.categories);
  const category = all.find((c) => c.name === name);
  if (!category) throw new Error(`No category ${name}`);
  return category.id;
}

describe('CategoriesService.list', () => {
  it('creates the defaults on first use and returns them in order', async () => {
    const { service } = setup();
    const { groups } = await service.list(A);

    expect(groups.map((g) => g.name)).toEqual(DEFAULT_CATEGORY_GROUPS.map((g) => g.name));
    expect(groups[0]!.categories.map((c) => c.name)).toEqual([
      'Mortgage',
      'Consumer loan',
      'Cash withdrawal',
    ]);
    expect(groups.every((g) => !g.archived && g.categories.every((c) => !c.archived))).toBe(true);
  });

  it('seeds only once per user', async () => {
    const { service, repository } = setup();
    await service.list(A);
    await service.list(A);
    await service.createGroup(A, { name: 'Pets' });
    expect(repository.seedCalls).toBe(1);
  });

  it('keeps users apart', async () => {
    const { service } = setup();
    const a = await service.list(A);
    const b = await service.list(B);

    const idsOf = (r: typeof a) =>
      r.groups.flatMap((g) => [g.id, ...g.categories.map((c) => c.id)]);
    expect(idsOf(a).filter((id) => idsOf(b).includes(id))).toEqual([]);
    expect(b.groups).toHaveLength(DEFAULT_CATEGORY_GROUPS.length);
  });
});

describe('creating', () => {
  it('adds a group at the end', async () => {
    const { service } = setup();
    const created = await service.createGroup(A, { name: 'Pets' });

    expect(created).toMatchObject({ name: 'Pets', archived: false });
    const names = await groupNames(service);
    expect(names.at(-1)).toBe('Pets');
    expect(names).toHaveLength(DEFAULT_CATEGORY_GROUPS.length + 1);
  });

  it('adds a category at the end of its group', async () => {
    const { service } = setup();
    const group = await groupId(service, 'Transport');
    const created = await service.createCategory(A, { groupId: group, name: 'Parking' });

    expect(created).toMatchObject({ groupId: group, name: 'Parking', archived: false });
    const transport = (await service.list(A)).groups.find((g) => g.id === group)!;
    expect(transport.categories.at(-1)!.name).toBe('Parking');
  });

  it('does not let a name be used twice, ignoring capital letters', async () => {
    const { service } = setup();
    const group = await groupId(service, 'Transport');

    expect(await failure(service.createGroup(A, { name: 'transport' }))).toEqual({
      status: 409,
      code: ErrorCode.NameTaken,
    });
    expect(await failure(service.createCategory(A, { groupId: group, name: 'FUEL' }))).toEqual({
      status: 409,
      code: ErrorCode.NameTaken,
    });
  });

  it('allows the same category name in a different group', async () => {
    const { service } = setup();
    const group = await groupId(service, 'Food');
    // "Other" exists in Child and Other, but not in Food.
    const created = await service.createCategory(A, { groupId: group, name: 'Other' });
    expect(created.name).toBe('Other');
  });

  it('points to the archive when the name belongs to an archived item', async () => {
    const { service } = setup();
    const fuel = await categoryId(service, 'Fuel');
    await service.updateCategory(A, fuel, { archived: true });
    const group = await groupId(service, 'Transport');

    expect(await failure(service.createCategory(A, { groupId: group, name: 'Fuel' }))).toEqual({
      status: 409,
      code: ErrorCode.NameInArchive,
    });
  });

  it('turns a database race on the name into the same friendly conflict', async () => {
    const { service, repository } = setup();
    await service.list(A);
    repository.createGroup = async () => {
      throw new DuplicateNameError();
    };
    expect(await failure(service.createGroup(A, { name: 'Pets' }))).toEqual({
      status: 409,
      code: ErrorCode.NameTaken,
    });
  });

  it("does not add a category to an archived group or to someone else's group", async () => {
    const { service } = setup();
    const food = await groupId(service, 'Food');
    await service.updateGroup(A, food, { archived: true });
    expect(await failure(service.createCategory(A, { groupId: food, name: 'Snacks' }))).toEqual({
      status: 409,
      code: ErrorCode.Conflict,
    });

    const alicesGroup = await groupId(service, 'Transport');
    expect(await failure(service.createCategory(B, { groupId: alicesGroup, name: 'X' }))).toEqual({
      status: 404,
      code: ErrorCode.NotFound,
    });
  });

  it('seeds the defaults first when the very first action is a change', async () => {
    const { service } = setup();
    // "Banks" is a default; without seeding first, this would succeed and then clash later.
    expect(await failure(service.createGroup(A, { name: 'Banks' }))).toEqual({
      status: 409,
      code: ErrorCode.NameTaken,
    });
  });
});

describe('renaming', () => {
  it('renames a group and a category', async () => {
    const { service } = setup();
    const group = await groupId(service, 'Home');
    const category = await categoryId(service, 'Water');

    expect(await service.updateGroup(A, group, { name: 'House' })).toMatchObject({ name: 'House' });
    expect(await service.updateCategory(A, category, { name: 'Water bill' })).toMatchObject({
      name: 'Water bill',
    });
    expect(await groupNames(service)).toContain('House');
  });

  it('accepts a change of capital letters on its own name', async () => {
    const { service } = setup();
    const group = await groupId(service, 'Home');
    expect(await service.updateGroup(A, group, { name: 'HOME' })).toMatchObject({ name: 'HOME' });
  });

  it('refuses a name another item already has', async () => {
    const { service } = setup();
    const group = await groupId(service, 'Home');
    const category = await categoryId(service, 'Water');

    expect(await failure(service.updateGroup(A, group, { name: 'Food' }))).toMatchObject({
      status: 409,
      code: ErrorCode.NameTaken,
    });
    expect(
      await failure(service.updateCategory(A, category, { name: 'Electricity' })),
    ).toMatchObject({ status: 409, code: ErrorCode.NameTaken });
  });

  it('answers "not found" for unknown ids and for another user\'s ids', async () => {
    const { service } = setup();
    const group = await groupId(service, 'Home');
    const category = await categoryId(service, 'Water');
    await service.list(B);

    expect(await failure(service.updateGroup(B, group, { name: 'Mine' }))).toEqual({
      status: 404,
      code: ErrorCode.NotFound,
    });
    expect(await failure(service.updateCategory(B, category, { archived: true }))).toEqual({
      status: 404,
      code: ErrorCode.NotFound,
    });
    expect(await failure(service.updateGroup(A, 'missing', { name: 'x' }))).toMatchObject({
      status: 404,
    });
    expect((await service.list(A)).groups.find((g) => g.id === group)!.name).toBe('Home');
  });
});

describe('archiving and restoring', () => {
  it('hides an archived category but still returns it when asked', async () => {
    const { service } = setup();
    const heating = await categoryId(service, 'Heating');
    await service.updateCategory(A, heating, { archived: true });

    const home = (await service.list(A)).groups.find((g) => g.name === 'Home')!;
    expect(home.categories.map((c) => c.name)).not.toContain('Heating');

    const all = (await service.list(A, true)).groups.find((g) => g.name === 'Home')!;
    expect(all.categories.find((c) => c.name === 'Heating')).toMatchObject({ archived: true });
  });

  it('archives all categories of an archived group, and restoring the group brings back only the group', async () => {
    const { service } = setup();
    const food = await groupId(service, 'Food');
    await service.updateGroup(A, food, { archived: true });

    expect(await groupNames(service)).not.toContain('Food');
    const archivedFood = (await service.list(A, true)).groups.find((g) => g.id === food)!;
    expect(archivedFood.archived).toBe(true);
    expect(archivedFood.categories.every((c) => c.archived)).toBe(true);

    await service.updateGroup(A, food, { archived: false });
    const restored = (await service.list(A)).groups.find((g) => g.id === food)!;
    expect(restored.categories).toEqual([]);
    const withArchived = (await service.list(A, true)).groups.find((g) => g.id === food)!;
    expect(withArchived.categories.map((c) => c.name)).toEqual(['Groceries', 'Restaurants']);
  });

  it('puts a restored group and a restored category at the end', async () => {
    const { service } = setup();
    const banks = await groupId(service, 'Banks');
    await service.updateGroup(A, banks, { archived: false }); // already active: no move
    expect((await groupNames(service))[0]).toBe('Banks');

    await service.updateGroup(A, banks, { archived: true });
    await service.updateGroup(A, banks, { archived: false });
    expect((await groupNames(service)).at(-1)).toBe('Banks');

    const mortgage = await categoryId(service, 'Mortgage');
    await service.updateCategory(A, mortgage, { archived: true });
    await service.updateCategory(A, mortgage, { archived: false });
    const group = (await service.list(A)).groups.find((g) => g.name === 'Banks')!;
    expect(group.categories.at(-1)!.name).toBe('Mortgage');
  });

  it('does not restore a category while its group is archived', async () => {
    const { service } = setup();
    const food = await groupId(service, 'Food');
    const groceries = await categoryId(service, 'Groceries');
    await service.updateGroup(A, food, { archived: true });

    expect(await failure(service.updateCategory(A, groceries, { archived: false }))).toEqual({
      status: 409,
      code: ErrorCode.Conflict,
    });

    await service.updateGroup(A, food, { archived: false });
    expect(await service.updateCategory(A, groceries, { archived: false })).toMatchObject({
      archived: false,
    });
  });

  it('is harmless to archive twice', async () => {
    const { service } = setup();
    const food = await groupId(service, 'Food');
    await service.updateGroup(A, food, { archived: true });
    expect(await service.updateGroup(A, food, { archived: true })).toMatchObject({
      archived: true,
    });
  });
});

describe('reordering', () => {
  it('saves a new order of groups', async () => {
    const { service } = setup();
    const ids = (await service.list(A)).groups.map((g) => g.id);
    const reversed = [...ids].reverse();
    await service.reorderGroups(A, reversed);

    expect((await service.list(A)).groups.map((g) => g.id)).toEqual(reversed);
  });

  it('saves a new order of categories inside a group', async () => {
    const { service } = setup();
    const home = (await service.list(A)).groups.find((g) => g.name === 'Home')!;
    const ids = home.categories.map((c) => c.id);
    const moved = [ids.at(-1)!, ...ids.slice(0, -1)];
    await service.reorderCategories(A, home.id, moved);

    const after = (await service.list(A)).groups.find((g) => g.name === 'Home')!;
    expect(after.categories.map((c) => c.id)).toEqual(moved);
  });

  it("refuses a list that is missing an item, has an extra one or someone else's", async () => {
    const { service } = setup();
    const mine = (await service.list(A)).groups.map((g) => g.id);
    const theirs = (await service.list(B)).groups.map((g) => g.id);

    for (const ids of [mine.slice(1), [...mine, 'extra'], [...mine.slice(1), theirs[0]!], theirs]) {
      expect(await failure(service.reorderGroups(A, ids))).toEqual({
        status: 409,
        code: ErrorCode.Conflict,
      });
    }
    expect((await service.list(A)).groups.map((g) => g.id)).toEqual(mine);
    expect((await service.list(B)).groups.map((g) => g.id)).toEqual(theirs);
  });

  it('leaves out archived groups, so a stale list is refused', async () => {
    const { service } = setup();
    const before = (await service.list(A)).groups.map((g) => g.id);
    await service.updateGroup(A, before[0]!, { archived: true });

    expect(await failure(service.reorderGroups(A, before))).toMatchObject({ status: 409 });
    await service.reorderGroups(A, before.slice(1).reverse());
  });

  it('answers "not found" when reordering the categories of someone else\'s group', async () => {
    const { service } = setup();
    const alices = (await service.list(A)).groups[0]!;
    await service.list(B);
    expect(
      await failure(
        service.reorderCategories(
          B,
          alices.id,
          alices.categories.map((c) => c.id),
        ),
      ),
    ).toEqual({ status: 404, code: ErrorCode.NotFound });
  });
});

describe('CategoriesService move and merge', () => {
  it('moves a category to the end of another group and keeps its id', async () => {
    const { service } = setup();
    await service.list(A);
    const id = await categoryId(service, 'Groceries');
    const target = await groupId(service, DEFAULT_CATEGORY_GROUPS[0]!.name);
    const moved = await service.updateCategory(A, id, { groupId: target });
    expect(moved).toMatchObject({ id, groupId: target });
  });

  it('refuses a move into an archived group, a missing group and a taken name', async () => {
    const { service } = setup();
    await service.list(A);
    const id = await categoryId(service, 'Groceries');
    const other = await groupId(service, DEFAULT_CATEGORY_GROUPS[0]!.name);
    await service.createCategory(A, { groupId: other, name: 'Groceries' });
    expect(await failure(service.updateCategory(A, id, { groupId: other }))).toMatchObject({
      status: 409,
      code: ErrorCode.NameTaken,
    });
    const empty = await service.createGroup(A, { name: 'Empty' });
    await service.updateGroup(A, empty.id, { archived: true });
    expect(await failure(service.updateCategory(A, id, { groupId: empty.id }))).toMatchObject({
      status: 409,
    });
    expect(
      await failure(
        service.updateCategory(A, id, { groupId: '00000000-0000-4000-8000-000000000000' }),
      ),
    ).toMatchObject({ status: 404 });
    // Another user's group is not reachable either.
    await service.list(B);
    const foreign = await groupId(service, DEFAULT_CATEGORY_GROUPS[0]!.name, B);
    expect(await failure(service.updateCategory(A, id, { groupId: foreign }))).toMatchObject({
      status: 404,
    });
  });

  it('merges: moves everything, archives the source and reports the counts', async () => {
    const { service, repository } = setup();
    await service.list(A);
    const source = await categoryId(service, 'Groceries');
    const target = await categoryId(service, 'Restaurants');
    repository.usage.set(source, { transactions: 3, obligations: 1 });
    expect(await service.usage(A, source)).toEqual({ transactions: 3, obligations: 1 });

    const result = await service.merge(A, source, target);
    expect(result).toMatchObject({ transactions: 3, obligations: 1, target: { id: target } });
    expect(await service.usage(A, target)).toEqual({ transactions: 3, obligations: 1 });
    const archived = (await service.list(A, true)).groups
      .flatMap((g) => g.categories)
      .find((c) => c.id === source);
    expect(archived?.archived).toBe(true);
  });

  it('refuses merging into itself, into an archived category and across users', async () => {
    const { service } = setup();
    await service.list(A);
    await service.list(B);
    const a = await categoryId(service, 'Groceries');
    const b = await categoryId(service, 'Restaurants');
    expect(await failure(service.merge(A, a, a))).toMatchObject({ status: 400 });
    await service.updateCategory(A, b, { archived: true });
    expect(await failure(service.merge(A, a, b))).toMatchObject({ status: 409 });
    const foreign = await categoryId(service, 'Restaurants', B);
    expect(await failure(service.merge(A, a, foreign))).toMatchObject({ status: 404 });
    expect(await failure(service.usage(B, a))).toMatchObject({ status: 404 });
  });
});
