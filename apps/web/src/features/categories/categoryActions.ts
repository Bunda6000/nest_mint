import type { CategoryGroupResponse, CategoryUsageResponse } from '@nestmint/shared';

/** What the editing screen can do. Each returns true when it worked, so a form can close itself. */
export interface CategoryActions {
  busy: boolean;
  /** All groups as loaded, to choose move and merge targets from. */
  groups: CategoryGroupResponse[];
  addGroup: (name: string) => Promise<boolean>;
  addCategory: (groupId: string, name: string) => Promise<boolean>;
  rename: (kind: ItemKind, id: string, name: string) => Promise<boolean>;
  setArchived: (kind: ItemKind, id: string, archived: boolean) => Promise<boolean>;
  moveToGroup: (categoryId: string, groupId: string) => Promise<boolean>;
  /** What a merge would move; null when it could not be read (the error is shown). */
  usage: (categoryId: string) => Promise<CategoryUsageResponse | null>;
  merge: (sourceId: string, targetId: string) => Promise<boolean>;
  moveGroup: (id: string, direction: -1 | 1) => Promise<boolean>;
  moveCategory: (groupId: string, id: string, direction: -1 | 1) => Promise<boolean>;
}

export type ItemKind = 'group' | 'category';
