import { Controller, Get } from '@nestjs/common';
import type { CategoriesResponse } from '@nestmint/shared';
import { type AuthenticatedUser, CurrentUser } from '../auth/current-user.decorator.js';
import { CategoriesService } from './categories.service.js';

@Controller('categories')
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser): Promise<CategoriesResponse> {
    return this.categories.list(user.id);
  }
}
