import type { CategoryGroupResponse } from '@nestmint/shared';

/**
 * The category chips for editing one expense: everything active, plus the expense's own category
 * even if it was archived since (keeping it is allowed; moving to another archived one is not).
 */
export function groupsForEdit(
  groups: CategoryGroupResponse[],
  currentCategoryId: string,
): CategoryGroupResponse[] {
  return groups
    .map((group) => ({
      ...group,
      categories: group.categories
        .filter((category) => !category.archived || category.id === currentCategoryId)
        .map((category) => ({
          ...category,
          name: category.archived ? `${category.name} (archived)` : category.name,
        })),
    }))
    .filter(
      (group) =>
        group.categories.length > 0 && (!group.archived || hasCurrent(group, currentCategoryId)),
    );
}

function hasCurrent(group: CategoryGroupResponse, categoryId: string): boolean {
  return group.categories.some((category) => category.id === categoryId);
}
