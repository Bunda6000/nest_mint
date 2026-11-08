import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import {
  type CategoriesResponse,
  type CategoryResponse,
  type CreateCategoryData,
  type CreateGroupData,
  ErrorCode,
  type GroupResponse,
  type UpdateCategoryItemData,
} from '@nestmint/shared';
import { ApiException } from '../common/api.exception.js';
import { Clock } from '../common/clock.js';
import {
  CATEGORIES_REPOSITORY,
  type CategoriesRepository,
  DuplicateNameError,
} from './categories.repository.js';
import { DEFAULT_CATEGORY_GROUPS } from './categories.seed.js';

const groupNotFound = () =>
  new ApiException(HttpStatus.NOT_FOUND, ErrorCode.NotFound, 'Group not found.');
const categoryNotFound = () =>
  new ApiException(HttpStatus.NOT_FOUND, ErrorCode.NotFound, 'Category not found.');
const staleList = () =>
  new ApiException(
    HttpStatus.CONFLICT,
    ErrorCode.Conflict,
    'The list has changed. Reload the page and try again.',
  );

function nameConflict(kind: 'group' | 'category', name: string, archived: boolean): ApiException {
  return archived
    ? new ApiException(
        HttpStatus.CONFLICT,
        ErrorCode.NameInArchive,
        `A ${kind} named "${name}" is in your archive. Restore it instead.`,
        { name: 'This name is in your archive' },
      )
    : new ApiException(
        HttpStatus.CONFLICT,
        ErrorCode.NameTaken,
        `You already have a ${kind} named "${name}".`,
        { name: 'This name is already used' },
      );
}

/** Keeps the rules for managing a user's categories; storage is behind the repository. */
@Injectable()
export class CategoriesService {
  constructor(
    @Inject(CATEGORIES_REPOSITORY) private readonly categories: CategoriesRepository,
    private readonly clock: Clock,
  ) {}

  /**
   * The user's categories. The defaults are created on first use rather than at registration, so
   * accounts that existed before categories did get them too. Every method below starts here, so a
   * custom name can never collide with defaults that are about to be created.
   */
  private async ensureSeeded(userId: string): Promise<void> {
    if (await this.categories.needsSeeding(userId)) {
      await this.categories.seedDefaultsOnce(userId, DEFAULT_CATEGORY_GROUPS, this.clock.now());
    }
  }

  async list(userId: string, includeArchived = false): Promise<CategoriesResponse> {
    await this.ensureSeeded(userId);
    return this.categories.list(userId, includeArchived);
  }

  async createGroup(userId: string, input: CreateGroupData): Promise<GroupResponse> {
    await this.ensureSeeded(userId);
    await this.assertGroupNameFree(userId, input.name);
    try {
      return await this.categories.createGroup(userId, input.name);
    } catch (error) {
      throw this.asNameConflict(error, 'group', input.name);
    }
  }

  async updateGroup(
    userId: string,
    groupId: string,
    change: UpdateCategoryItemData,
  ): Promise<GroupResponse> {
    await this.ensureSeeded(userId);
    if (!(await this.categories.findGroup(userId, groupId))) throw groupNotFound();
    if (change.name !== undefined) await this.assertGroupNameFree(userId, change.name, groupId);

    try {
      const updated = await this.categories.updateGroup(userId, groupId, change, this.clock.now());
      if (!updated) throw groupNotFound();
      return updated;
    } catch (error) {
      throw this.asNameConflict(error, 'group', change.name);
    }
  }

  async createCategory(userId: string, input: CreateCategoryData): Promise<CategoryResponse> {
    await this.ensureSeeded(userId);
    const group = await this.categories.findGroup(userId, input.groupId);
    if (!group) throw groupNotFound();
    if (group.archived) {
      throw new ApiException(
        HttpStatus.CONFLICT,
        ErrorCode.Conflict,
        'This group is archived. Restore it before adding categories.',
      );
    }
    await this.assertCategoryNameFree(userId, input.groupId, input.name);
    try {
      return await this.categories.createCategory(userId, input.groupId, input.name);
    } catch (error) {
      throw this.asNameConflict(error, 'category', input.name);
    }
  }

  async updateCategory(
    userId: string,
    categoryId: string,
    change: UpdateCategoryItemData,
  ): Promise<CategoryResponse> {
    await this.ensureSeeded(userId);
    const current = await this.categories.findCategory(userId, categoryId);
    if (!current) throw categoryNotFound();

    if (change.archived === false && current.groupArchived) {
      throw new ApiException(
        HttpStatus.CONFLICT,
        ErrorCode.Conflict,
        'Its group is archived. Restore the group first.',
      );
    }
    if (change.name !== undefined) {
      await this.assertCategoryNameFree(userId, current.groupId, change.name, categoryId);
    }

    try {
      const updated = await this.categories.updateCategory(
        userId,
        categoryId,
        change,
        this.clock.now(),
      );
      if (!updated) throw categoryNotFound();
      return updated;
    } catch (error) {
      throw this.asNameConflict(error, 'category', change.name);
    }
  }

  async reorderGroups(userId: string, ids: readonly string[]): Promise<void> {
    await this.ensureSeeded(userId);
    if (!(await this.categories.reorderGroups(userId, ids))) throw staleList();
  }

  async reorderCategories(userId: string, groupId: string, ids: readonly string[]): Promise<void> {
    await this.ensureSeeded(userId);
    const group = await this.categories.findGroup(userId, groupId);
    if (!group) throw groupNotFound();
    if (group.archived || !(await this.categories.reorderCategories(userId, groupId, ids))) {
      throw staleList();
    }
  }

  private async assertGroupNameFree(
    userId: string,
    name: string,
    exceptId?: string,
  ): Promise<void> {
    const existing = await this.categories.findGroupByName(userId, name);
    if (existing && existing.id !== exceptId) throw nameConflict('group', name, existing.archived);
  }

  private async assertCategoryNameFree(
    userId: string,
    groupId: string,
    name: string,
    exceptId?: string,
  ): Promise<void> {
    const existing = await this.categories.findCategoryByName(userId, groupId, name);
    if (existing && existing.id !== exceptId) {
      throw nameConflict('category', name, existing.archived);
    }
  }

  /** Two requests can pass the check together; the database constraint then decides. */
  private asNameConflict(error: unknown, kind: 'group' | 'category', name?: string): unknown {
    return error instanceof DuplicateNameError ? nameConflict(kind, name ?? '', false) : error;
  }
}
