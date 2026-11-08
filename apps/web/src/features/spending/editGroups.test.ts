import type { CategoryGroupResponse } from '@nestmint/shared';
import { describe, expect, it } from 'vitest';
import { groupsForEdit } from './editGroups';

const groups: CategoryGroupResponse[] = [
  {
    id: 'g1',
    name: 'Food',
    archived: false,
    categories: [
      { id: 'c1', groupId: 'g1', name: 'Groceries', archived: false },
      { id: 'c2', groupId: 'g1', name: 'Snacks', archived: true },
    ],
  },
  {
    id: 'g2',
    name: 'Old',
    archived: true,
    categories: [{ id: 'c3', groupId: 'g2', name: 'Gym', archived: true }],
  },
  { id: 'g3', name: 'Empty', archived: false, categories: [] },
];

const names = (result: CategoryGroupResponse[]) =>
  result.map((g) => [g.name, g.categories.map((c) => c.name)]);

describe('groupsForEdit', () => {
  it('offers active categories only, and leaves out archived groups and empty groups', () => {
    expect(names(groupsForEdit(groups, 'c1'))).toEqual([['Food', ['Groceries']]]);
  });

  it("keeps the expense's own archived category, marked as archived", () => {
    expect(names(groupsForEdit(groups, 'c2'))).toEqual([
      ['Food', ['Groceries', 'Snacks (archived)']],
    ]);
  });

  it("keeps the expense's own category even when its whole group is archived", () => {
    expect(names(groupsForEdit(groups, 'c3'))).toEqual([
      ['Food', ['Groceries']],
      ['Old', ['Gym (archived)']],
    ]);
  });

  it('does not change what it was given', () => {
    groupsForEdit(groups, 'c2');
    expect(groups[0]!.categories[1]!.name).toBe('Snacks');
  });
});
