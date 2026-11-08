import type { CategoriesResponse } from '@nestmint/shared';
import type { SeedGroup } from './categories.seed.js';

export const CATEGORIES_REPOSITORY = Symbol('CATEGORIES_REPOSITORY');

/**
 * Every method takes the owner's id and only ever touches that user's rows. Never add a method
 * that reads or writes categories without a userId (see docs/adr/006-user-data-isolation.md).
 */
export interface CategoriesRepository {
  /** True when the user's default categories have not been created yet. */
  needsSeeding(userId: string): Promise<boolean>;

  /**
   * Creates the default categories exactly once per user, even when called concurrently.
   * Does nothing if they were already created, including when the user later deleted them.
   */
  seedDefaultsOnce(userId: string, groups: readonly SeedGroup[], at: Date): Promise<void>;

  list(userId: string): Promise<CategoriesResponse>;
}
