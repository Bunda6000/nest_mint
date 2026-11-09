import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import {
  type CreateObligationData,
  END_BEFORE_START,
  ErrorCode,
  type ObligationResponse,
  type ObligationsResponse,
  type UpdateObligationData,
} from '@nestmint/shared';
import {
  CATEGORIES_REPOSITORY,
  type CategoriesRepository,
} from '../categories/categories.repository.js';
import { ApiException } from '../common/api.exception.js';
import {
  OBLIGATIONS_REPOSITORY,
  type ObligationChange,
  type ObligationsRepository,
} from './obligations.repository.js';

const notFound = (what: string) =>
  new ApiException(HttpStatus.NOT_FOUND, ErrorCode.NotFound, `${what} not found.`);

const invalid = (details: Record<string, string>) =>
  new ApiException(
    HttpStatus.BAD_REQUEST,
    ErrorCode.ValidationFailed,
    'Some fields are invalid.',
    details,
  );

@Injectable()
export class ObligationsService {
  constructor(
    @Inject(OBLIGATIONS_REPOSITORY) private readonly obligations: ObligationsRepository,
    @Inject(CATEGORIES_REPOSITORY) private readonly categories: CategoriesRepository,
  ) {}

  async create(userId: string, input: CreateObligationData): Promise<ObligationResponse> {
    await this.assertCategoryUsable(userId, input.categoryId);
    return this.obligations.create(userId, {
      name: input.name,
      payee: input.payee ?? null,
      categoryId: input.categoryId,
      expectedAmountMkd: input.expectedAmountMkd,
      dueDay: input.dueDay,
      recurrence: input.recurrence,
      everyNMonths: input.recurrence === 'every_n_months' ? input.everyNMonths : null,
      months: input.recurrence === 'custom_months' ? input.months : [],
      startMonth: input.startMonth,
      endMonth: input.endMonth ?? null,
    });
  }

  /** By name, so the list reads like the spreadsheet's. */
  async list(userId: string): Promise<ObligationsResponse> {
    const all = await this.obligations.list(userId);
    return {
      obligations: [...all].sort((a, b) =>
        a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }),
      ),
    };
  }

  async update(
    userId: string,
    id: string,
    input: UpdateObligationData,
  ): Promise<ObligationResponse> {
    const existing = await this.obligations.find(userId, id);
    if (!existing) throw notFound('Obligation');

    if (input.everyNMonths !== undefined && existing.recurrence !== 'every_n_months') {
      throw invalid({ everyNMonths: 'Only for bills every few months' });
    }
    if (input.months !== undefined && existing.recurrence !== 'custom_months') {
      throw invalid({ months: 'Only for bills in chosen months' });
    }

    // The end must not come before the start, whichever of the two is being changed.
    const start = input.startMonth ?? existing.startMonth;
    const end = input.endMonth === undefined ? existing.endMonth : input.endMonth;
    if (end && end < start) {
      throw invalid({
        [input.endMonth !== undefined ? 'endMonth' : 'startMonth']: END_BEFORE_START,
      });
    }

    if (input.categoryId !== undefined && input.categoryId !== existing.categoryId) {
      await this.assertCategoryUsable(userId, input.categoryId);
    }

    const change: ObligationChange = {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.payee !== undefined ? { payee: input.payee } : {}),
      ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
      ...(input.expectedAmountMkd !== undefined
        ? { expectedAmountMkd: input.expectedAmountMkd }
        : {}),
      ...(input.dueDay !== undefined ? { dueDay: input.dueDay } : {}),
      ...(input.startMonth !== undefined ? { startMonth: input.startMonth } : {}),
      ...(input.endMonth !== undefined ? { endMonth: input.endMonth } : {}),
      ...(input.everyNMonths !== undefined ? { everyNMonths: input.everyNMonths } : {}),
      ...(input.months !== undefined ? { months: input.months } : {}),
    };
    const updated = await this.obligations.update(userId, id, change);
    if (!updated) throw notFound('Obligation');
    return updated;
  }

  /** The category must be the user's own (else "not found") and not archived (else "conflict"). */
  private async assertCategoryUsable(userId: string, categoryId: string): Promise<void> {
    const category = await this.categories.findCategory(userId, categoryId);
    if (!category) throw notFound('Category');
    if (category.archived || category.groupArchived) {
      throw new ApiException(
        HttpStatus.CONFLICT,
        ErrorCode.Conflict,
        'This category is archived. Pick another one.',
      );
    }
  }
}
