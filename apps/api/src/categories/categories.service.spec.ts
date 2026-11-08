import { describe, expect, it } from 'vitest';
import { FakeClock, InMemoryCategories } from '../testing/fakes.js';
import { CategoriesService } from './categories.service.js';
import { DEFAULT_CATEGORY_GROUPS } from './categories.seed.js';

function setup() {
  const repository = new InMemoryCategories();
  return { repository, service: new CategoriesService(repository, new FakeClock()) };
}

describe('CategoriesService.list', () => {
  it('creates the defaults on first use and returns them in order', async () => {
    const { service } = setup();
    const { groups } = await service.list('user-a');

    expect(groups.map((g) => g.name)).toEqual(DEFAULT_CATEGORY_GROUPS.map((g) => g.name));
    expect(groups[0]!.categories.map((c) => c.name)).toEqual([
      'Mortgage',
      'Consumer loan',
      'Cash withdrawal',
    ]);
  });

  it('seeds only once per user', async () => {
    const { service, repository } = setup();
    await service.list('user-a');
    await service.list('user-a');
    await service.list('user-a');
    expect(repository.seedCalls).toBe(1);
  });

  it('keeps users apart', async () => {
    const { service } = setup();
    const a = await service.list('user-a');
    const b = await service.list('user-b');

    const idsOf = (r: typeof a) =>
      r.groups.flatMap((g) => [g.id, ...g.categories.map((c) => c.id)]);
    expect(idsOf(a).filter((id) => idsOf(b).includes(id))).toEqual([]);
    expect(b.groups).toHaveLength(DEFAULT_CATEGORY_GROUPS.length);
  });
});
