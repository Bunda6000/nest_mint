import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import {
  type CreateIncomeData,
  END_BEFORE_START,
  ErrorCode,
  type IncomeResponse,
  type IncomesResponse,
  type UpdateIncomeData,
} from '@nestmint/shared';
import { ApiException } from '../common/api.exception.js';
import {
  INCOME_REPOSITORY,
  type IncomeChange,
  type IncomeRepository,
} from './income.repository.js';

const notFound = () =>
  new ApiException(HttpStatus.NOT_FOUND, ErrorCode.NotFound, 'Income not found.');

const invalid = (details: Record<string, string>) =>
  new ApiException(
    HttpStatus.BAD_REQUEST,
    ErrorCode.ValidationFailed,
    'Some fields are invalid.',
    details,
  );

/** The month (monthly) or the day (one-off) an entry starts counting, for sorting. */
const sortKey = (income: IncomeResponse): string =>
  income.recurrence === 'monthly' ? `${income.startMonth}-01` : (income.receivedOn ?? '');

@Injectable()
export class IncomeService {
  constructor(@Inject(INCOME_REPOSITORY) private readonly income: IncomeRepository) {}

  create(userId: string, input: CreateIncomeData): Promise<IncomeResponse> {
    if (input.recurrence === 'monthly') {
      return this.income.create(userId, {
        name: input.name,
        amountMkd: input.amountMkd,
        recurrence: 'monthly',
        receivedOn: null,
        startMonth: input.startMonth,
        endMonth: input.endMonth ?? null,
        payDay: input.payDay,
      });
    }
    return this.income.create(userId, {
      name: input.name,
      amountMkd: input.amountMkd,
      recurrence: 'one_off',
      receivedOn: input.receivedOn,
      startMonth: null,
      endMonth: null,
      payDay: null,
    });
  }

  /** Newest first by start month or date; monthly and one-off income mixed. */
  async list(userId: string): Promise<IncomesResponse> {
    const all = await this.income.list(userId);
    // Array.sort is stable, so entries with the same start keep the repository's order.
    return { incomes: [...all].sort((a, b) => sortKey(b).localeCompare(sortKey(a))) };
  }

  async update(userId: string, id: string, input: UpdateIncomeData): Promise<IncomeResponse> {
    const existing = await this.income.find(userId, id);
    if (!existing) throw notFound();

    const monthlyOnly = ['startMonth', 'endMonth', 'payDay'] as const;
    if (existing.recurrence === 'one_off') {
      const wrong = monthlyOnly.filter((field) => input[field] !== undefined);
      if (wrong.length > 0) {
        throw invalid(Object.fromEntries(wrong.map((f) => [f, 'Only for monthly income'])));
      }
    } else if (input.receivedOn !== undefined) {
      throw invalid({ receivedOn: 'Only for one-off income' });
    }

    // The end must not come before the start, whichever of the two is being changed.
    const start = input.startMonth ?? existing.startMonth;
    const end = input.endMonth === undefined ? existing.endMonth : input.endMonth;
    if (existing.recurrence === 'monthly' && start && end && end < start) {
      throw invalid({
        [input.endMonth !== undefined ? 'endMonth' : 'startMonth']: END_BEFORE_START,
      });
    }

    const change: IncomeChange = {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.amountMkd !== undefined ? { amountMkd: input.amountMkd } : {}),
      ...(input.receivedOn !== undefined ? { receivedOn: input.receivedOn } : {}),
      ...(input.startMonth !== undefined ? { startMonth: input.startMonth } : {}),
      ...(input.endMonth !== undefined ? { endMonth: input.endMonth } : {}),
      ...(input.payDay !== undefined ? { payDay: input.payDay } : {}),
    };
    const updated = await this.income.update(userId, id, change);
    if (!updated) throw notFound();
    return updated;
  }

  async delete(userId: string, id: string): Promise<void> {
    if (!(await this.income.delete(userId, id))) throw notFound();
  }
}
