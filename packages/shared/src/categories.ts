import { z } from 'zod';

export interface GroupResponse {
  id: string;
  name: string;
  archived: boolean;
}

export interface CategoryResponse {
  id: string;
  groupId: string;
  name: string;
  archived: boolean;
}

export interface CategoryGroupResponse extends GroupResponse {
  categories: CategoryResponse[];
}

/** The logged-in user's categories, grouped and in display order. */
export interface CategoriesResponse {
  groups: CategoryGroupResponse[];
}

export const MAX_CATEGORY_NAME_LENGTH = 60;

export const categoryNameSchema = z
  .string()
  .trim()
  .min(1, 'Enter a name')
  .max(MAX_CATEGORY_NAME_LENGTH, `Name must be at most ${MAX_CATEGORY_NAME_LENGTH} characters`);

export const createGroupSchema = z.object({ name: categoryNameSchema });
export type CreateGroupData = z.output<typeof createGroupSchema>;

export const createCategorySchema = z.object({
  groupId: z.uuid('Choose a group'),
  name: categoryNameSchema,
});
export type CreateCategoryData = z.output<typeof createCategorySchema>;

/** Rename and/or archive (`archived: true`) or restore (`archived: false`). */
export const updateCategoryItemSchema = z
  .object({
    name: categoryNameSchema.optional(),
    archived: z.boolean().optional(),
  })
  .refine((value) => value.name !== undefined || value.archived !== undefined, {
    message: 'Nothing to change',
  });
export type UpdateCategoryItemData = z.output<typeof updateCategoryItemSchema>;

/** Rename, archive/restore and/or move to another group (`groupId`) – used for categories only. */
export const updateCategorySchema = z
  .object({
    name: categoryNameSchema.optional(),
    archived: z.boolean().optional(),
    groupId: z.uuid().optional(),
  })
  .refine(
    (value) =>
      value.name !== undefined || value.archived !== undefined || value.groupId !== undefined,
    { message: 'Nothing to change' },
  );
export type UpdateCategoryData = z.output<typeof updateCategorySchema>;

/** Merge: everything of this category moves to `targetCategoryId`, then it is archived. */
export const mergeCategorySchema = z.object({ targetCategoryId: z.uuid() });
export type MergeCategoryData = z.output<typeof mergeCategorySchema>;

/** What a category is used by; shown before a merge. */
export interface CategoryUsageResponse {
  transactions: number;
  obligations: number;
}

/** What a merge moved. */
export interface MergeCategoryResponse extends CategoryUsageResponse {
  target: CategoryResponse;
}

/** The complete, new order of the active items in a list. */
export const reorderSchema = z.object({
  ids: z
    .array(z.uuid())
    .min(1)
    .refine((ids) => new Set(ids).size === ids.length, { message: 'Each item once' }),
});
export type ReorderData = z.output<typeof reorderSchema>;
