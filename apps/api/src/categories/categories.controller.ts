import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {
  type CategoriesResponse,
  type CategoryResponse,
  type CategoryUsageResponse,
  type CreateCategoryData,
  type CreateGroupData,
  createCategorySchema,
  createGroupSchema,
  type GroupResponse,
  type MergeCategoryData,
  type MergeCategoryResponse,
  mergeCategorySchema,
  type ReorderData,
  reorderSchema,
  type UpdateCategoryData,
  type UpdateCategoryItemData,
  updateCategoryItemSchema,
  updateCategorySchema,
} from '@nestmint/shared';
import { type AuthenticatedUser, CurrentUser } from '../auth/current-user.decorator.js';
import { UuidParamPipe } from '../common/uuid-param.pipe.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { CategoriesService } from './categories.service.js';

@Controller('categories')
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  /** `?includeArchived=true` also returns archived groups and categories, flagged `archived`. */
  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('includeArchived') includeArchived?: string,
  ): Promise<CategoriesResponse> {
    return this.categories.list(user.id, includeArchived === 'true');
  }

  @Post('groups')
  createGroup(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe<CreateGroupData>(createGroupSchema)) body: CreateGroupData,
  ): Promise<GroupResponse> {
    return this.categories.createGroup(user.id, body);
  }

  @Put('groups/order')
  @HttpCode(HttpStatus.NO_CONTENT)
  reorderGroups(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe<ReorderData>(reorderSchema)) body: ReorderData,
  ): Promise<void> {
    return this.categories.reorderGroups(user.id, body.ids);
  }

  @Patch('groups/:id')
  updateGroup(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', UuidParamPipe) id: string,
    @Body(new ZodValidationPipe<UpdateCategoryItemData>(updateCategoryItemSchema))
    body: UpdateCategoryItemData,
  ): Promise<GroupResponse> {
    return this.categories.updateGroup(user.id, id, body);
  }

  @Put('groups/:id/order')
  @HttpCode(HttpStatus.NO_CONTENT)
  reorderCategories(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', UuidParamPipe) id: string,
    @Body(new ZodValidationPipe<ReorderData>(reorderSchema)) body: ReorderData,
  ): Promise<void> {
    return this.categories.reorderCategories(user.id, id, body.ids);
  }

  @Post()
  createCategory(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe<CreateCategoryData>(createCategorySchema))
    body: CreateCategoryData,
  ): Promise<CategoryResponse> {
    return this.categories.createCategory(user.id, body);
  }

  @Patch(':id')
  updateCategory(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', UuidParamPipe) id: string,
    @Body(new ZodValidationPipe<UpdateCategoryData>(updateCategorySchema))
    body: UpdateCategoryData,
  ): Promise<CategoryResponse> {
    return this.categories.updateCategory(user.id, id, body);
  }

  @Get(':id/usage')
  usage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', UuidParamPipe) id: string,
  ): Promise<CategoryUsageResponse> {
    return this.categories.usage(user.id, id);
  }

  @Post(':id/merge')
  @HttpCode(HttpStatus.OK)
  merge(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', UuidParamPipe) id: string,
    @Body(new ZodValidationPipe<MergeCategoryData>(mergeCategorySchema)) body: MergeCategoryData,
  ): Promise<MergeCategoryResponse> {
    return this.categories.merge(user.id, id, body.targetCategoryId);
  }
}
