import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import {
  annuityPaymentMkd,
  installmentEndMonth,
  installmentPlan,
  loanTermMonths,
} from '@nestmint/finance-engine';
import {
  type CreateInstallmentData,
  type CreateLoanData,
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

  /**
   * A loan is a monthly obligation from the first to the last month, so its payments become bills
   * the same way as any recurring bill. Without a payment given, the fixed monthly payment is
   * worked out as an annuity.
   */
  async createLoan(userId: string, input: CreateLoanData): Promise<ObligationResponse> {
    await this.assertCategoryUsable(userId, input.categoryId);
    const monthlyPaymentMkd =
      input.monthlyPaymentMkd ??
      annuityPaymentMkd(
        input.principalMkd,
        input.annualRateBp,
        loanTermMonths(input.startMonth, input.endMonth),
      );
    if (monthlyPaymentMkd < 1) {
      throw invalid({
        monthlyPaymentMkd: 'The payment comes out below 1 denar. Enter it yourself.',
      });
    }
    return this.obligations.create(userId, {
      name: input.name,
      payee: input.lender,
      categoryId: input.categoryId,
      expectedAmountMkd: monthlyPaymentMkd,
      dueDay: input.dueDay,
      recurrence: 'monthly',
      everyNMonths: null,
      months: [],
      startMonth: input.startMonth,
      endMonth: input.endMonth,
      loan: {
        loanType: input.loanType,
        principalMkd: input.principalMkd,
        annualRateBp: input.annualRateBp,
      },
    });
  }

  /**
   * An installment plan is a monthly obligation from the start month to the month of its last
   * installment, which is worked out here. The installments themselves (first, regular, smaller
   * last) are laid out when each month's bill is created.
   */
  async createInstallment(
    userId: string,
    input: CreateInstallmentData,
  ): Promise<ObligationResponse> {
    await this.assertCategoryUsable(userId, input.categoryId);
    let endMonth: string;
    try {
      endMonth = installmentEndMonth(
        installmentPlan(
          input.contractTotalMkd,
          input.firstInstallmentMkd,
          input.regularInstallmentMkd,
        ),
        input.startMonth,
      );
    } catch (error) {
      if (!(error instanceof RangeError)) throw error;
      throw invalid({ regularInstallmentMkd: 'The plan would have too many installments' });
    }
    return this.obligations.create(userId, {
      name: input.name,
      payee: input.payee ?? null,
      categoryId: input.categoryId,
      expectedAmountMkd: input.regularInstallmentMkd,
      dueDay: input.dueDay,
      recurrence: 'monthly',
      everyNMonths: null,
      months: [],
      startMonth: input.startMonth,
      endMonth,
      installment: {
        contractTotalMkd: input.contractTotalMkd,
        firstInstallmentMkd: input.firstInstallmentMkd,
      },
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
    if (existing.loan) {
      // A loan's payment and rate change with a rate change (from a month on), not by editing.
      if (input.expectedAmountMkd !== undefined) {
        throw invalid({ expectedAmountMkd: 'Change the payment with a rate change' });
      }
      if (input.payee === null) throw invalid({ payee: 'A loan needs a lender' });
      if (input.endMonth === null) throw invalid({ endMonth: 'A loan needs a last month' });
    } else {
      if (input.loanType !== undefined) throw invalid({ loanType: 'Only for loans' });
      if (input.principalMkd !== undefined) throw invalid({ principalMkd: 'Only for loans' });
    }
    if (existing.installment) {
      // The amounts and months of the plan fix its installments; to change them, delete or archive
      // the plan and add a new one.
      const locked = {
        expectedAmountMkd: 'The installments of a plan cannot be changed',
        startMonth: 'The months of a plan cannot be changed',
        endMonth: 'The months of a plan cannot be changed',
      } as const;
      for (const field of Object.keys(locked) as (keyof typeof locked)[]) {
        if (input[field] !== undefined) throw invalid({ [field]: locked[field] });
      }
    }

    // The end must not come before the start, whichever of the two is being changed.
    const start = input.startMonth ?? existing.startMonth;
    const end = input.endMonth === undefined ? existing.endMonth : input.endMonth;
    if (end && end < start) {
      throw invalid({
        [input.endMonth !== undefined ? 'endMonth' : 'startMonth']: END_BEFORE_START,
      });
    }

    // A loan's rate changes must stay inside its months.
    if (existing.loan && end) {
      const outside = existing.loan.rateChanges.find(
        (c) => c.effectiveMonth < start || c.effectiveMonth > end,
      );
      if (outside) {
        throw invalid({
          [input.startMonth !== undefined ? 'startMonth' : 'endMonth']:
            `A rate change from ${outside.effectiveMonth} would fall outside these dates`,
        });
      }
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
      ...(input.loanType !== undefined ? { loanType: input.loanType } : {}),
      ...(input.principalMkd !== undefined ? { principalMkd: input.principalMkd } : {}),
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
