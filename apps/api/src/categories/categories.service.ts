import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import {
  type CategoriesResponse,
  type CategoryResponse,
  type CategoryUsageResponse,
  type CreateCategoryData,
  type CreateGroupData,
  ErrorCode,
  type GroupResponse,
  type MergeCategoryResponse,
  type UpdateCategoryData,
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
    change: UpdateCategoryData,
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
    // A move keeps the category's id, so its transactions and bills stay with it.
    const moving = change.groupId !== undefined && change.groupId !== current.groupId;
    if (moving) {
      const target = await this.categories.findGroup(userId, change.groupId!);
      if (!target) throw groupNotFound();
      if (target.archived) {
        throw new ApiException(
          HttpStatus.CONFLICT,
          ErrorCode.Conflict,
          'That group is archived. Restore it before moving a category into it.',
        );
      }
    }
    const finalGroup = moving ? change.groupId! : current.groupId;
    if (change.name !== undefined || moving) {
      await this.assertCategoryNameFree(
        userId,
        finalGroup,
        change.name ?? current.name,
        categoryId,
      );
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

  /** How many items a merge would move; shown in the confirmation. */
  async usage(userId: string, categoryId: string): Promise<CategoryUsageResponse> {
    await this.ensureSeeded(userId);
    if (!(await this.categories.findCategory(userId, categoryId))) throw categoryNotFound();
    return this.categories.categoryUsage(userId, categoryId);
  }

  /** Moves everything of `sourceId` to `targetId` and archives `sourceId`. */
  async merge(userId: string, sourceId: string, targetId: string): Promise<MergeCategoryResponse> {
    await this.ensureSeeded(userId);
    const source = await this.categories.findCategory(userId, sourceId);
    const target = await this.categories.findCategory(userId, targetId);
    if (!source || !target) throw categoryNotFound();
    if (sourceId === targetId) {
      throw new ApiException(
        HttpStatus.BAD_REQUEST,
        ErrorCode.ValidationFailed,
        'Choose a different category to merge into.',
      );
    }
    if (target.archived || target.groupArchived) {
      throw new ApiException(
        HttpStatus.CONFLICT,
        ErrorCode.Conflict,
        'The category to merge into is archived. Restore it first.',
      );
    }
    const moved = await this.categories.mergeCategory(userId, sourceId, targetId, this.clock.now());
    if (!moved) throw categoryNotFound();
    return { ...moved, target };
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
