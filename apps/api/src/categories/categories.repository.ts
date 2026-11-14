import type {
  CategoriesResponse,
  CategoryResponse,
  CategoryUsageResponse,
  GroupResponse,
} from '@nestmint/shared';
import type { SeedGroup } from './categories.seed.js';

export const CATEGORIES_REPOSITORY = Symbol('CATEGORIES_REPOSITORY');

/** A rename and/or an archive (`true`) or restore (`false`). */
export interface ItemChange {
  name?: string;
  archived?: boolean;
  /** Categories only: move to this group (the caller has checked it is active and the name is free). */
  groupId?: string;
}

export interface CategoryRecord extends CategoryResponse {
  /** True when the category's group is archived. */
  groupArchived: boolean;
}

/** The unique constraint on a name was hit, usually because two requests raced. */
export class DuplicateNameError extends Error {
  constructor() {
    super('Duplicate category name');
  }
}

/**
 * Every method takes the owner's id and only ever touches that user's rows. Never add a method
 * that reads or writes categories without a userId (see docs/adr/006-user-data-isolation.md).
 *
 * Archiving keeps the row. Restoring moves the item to the end of its list. Names are unique per
 * user (groups) and per group (categories), archived items included.
 */
export interface CategoriesRepository {
  /** True when the user's default categories have not been created yet. */
  needsSeeding(userId: string): Promise<boolean>;

  /**
   * Creates the default categories exactly once per user, even when called concurrently.
   * Does nothing if they were already created, including when the user later deleted them.
   */
  seedDefaultsOnce(userId: string, groups: readonly SeedGroup[], at: Date): Promise<void>;

  /** Groups and categories in display order; archived ones only when asked for. */
  list(userId: string, includeArchived: boolean): Promise<CategoriesResponse>;

  findGroup(userId: string, groupId: string): Promise<GroupResponse | null>;
  /** Case-insensitive; archived groups included. */
  findGroupByName(userId: string, name: string): Promise<GroupResponse | null>;
  findCategory(userId: string, categoryId: string): Promise<CategoryRecord | null>;
  /** Case-insensitive, within one group; archived categories included. */
  findCategoryByName(
    userId: string,
    groupId: string,
    name: string,
  ): Promise<CategoryResponse | null>;

  /** Adds to the end of the list. Throws DuplicateNameError. */
  createGroup(userId: string, name: string): Promise<GroupResponse>;
  /** Adds to the end of the group. Throws DuplicateNameError. */
  createCategory(userId: string, groupId: string, name: string): Promise<CategoryResponse>;

  /**
   * Archiving a group archives all its categories too; restoring it does not restore them.
   * Returns null when the group does not exist or belongs to someone else. Throws DuplicateNameError.
   */
  updateGroup(
    userId: string,
    groupId: string,
    change: ItemChange,
    at: Date,
  ): Promise<GroupResponse | null>;
  /** Returns null when the category does not exist or belongs to someone else. Throws DuplicateNameError. */
  updateCategory(
    userId: string,
    categoryId: string,
    change: ItemChange,
    at: Date,
  ): Promise<CategoryResponse | null>;

  /** How many transactions and obligations use the category. */
  categoryUsage(userId: string, categoryId: string): Promise<CategoryUsageResponse>;
  /**
   * Moves all transactions and obligations of `sourceId` to `targetId` and archives the source, in
   * one step. Returns what moved, or null when either category is not the user's.
   */
  mergeCategory(
    userId: string,
    sourceId: string,
    targetId: string,
    at: Date,
  ): Promise<CategoryUsageResponse | null>;

  /** `ids` must be exactly the user's active groups. Returns false (and changes nothing) otherwise. */
  reorderGroups(userId: string, ids: readonly string[]): Promise<boolean>;
  /** `ids` must be exactly the active categories of the group. Returns false (and changes nothing) otherwise. */
  reorderCategories(userId: string, groupId: string, ids: readonly string[]): Promise<boolean>;
}
