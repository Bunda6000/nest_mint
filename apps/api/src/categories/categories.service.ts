import { Inject, Injectable } from '@nestjs/common';
import type { CategoriesResponse } from '@nestmint/shared';
import { Clock } from '../common/clock.js';
import { CATEGORIES_REPOSITORY, type CategoriesRepository } from './categories.repository.js';
import { DEFAULT_CATEGORY_GROUPS } from './categories.seed.js';

@Injectable()
export class CategoriesService {
  constructor(
    @Inject(CATEGORIES_REPOSITORY) private readonly categories: CategoriesRepository,
    private readonly clock: Clock,
  ) {}

  /**
   * The user's categories. The defaults are created on first use rather than at registration, so
   * accounts that existed before categories did get them too.
   */
  async list(userId: string): Promise<CategoriesResponse> {
    if (await this.categories.needsSeeding(userId)) {
      await this.categories.seedDefaultsOnce(userId, DEFAULT_CATEGORY_GROUPS, this.clock.now());
    }
    return this.categories.list(userId);
  }
}
