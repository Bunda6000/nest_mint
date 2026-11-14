import { describe, expect, it } from 'vitest';
import { fieldErrors } from './auth/register.js';
import { END_BEFORE_START } from './income.js';
import {
  createLoanSchema,
  createObligationSchema,
  MAX_OBLIGATION_NAME_LENGTH,
  MAX_PAYEE_LENGTH,
  updateObligationSchema,
} from './obligations.js';
import { MAX_EXPENSE_MKD } from './transactions.js';

const categoryId = '3f0f6c1e-8d6a-4b7e-9c55-0a1b2c3d4e5f';
const electricity = {
  recurrence: 'monthly',
  name: 'Electricity',
  payee: 'EVN',
  categoryId,
  expectedAmountMkd: 4_500,
  dueDay: 15,
  startMonth: '2026-01',
};

/** The object without one field. */
function without<T extends object>(value: T, field: keyof T): Partial<T> {
  return Object.fromEntries(Object.entries(value).filter(([key]) => key !== field)) as Partial<T>;
}

function errorsOf(
  schema: typeof createObligationSchema | typeof updateObligationSchema,
  input: unknown,
) {
  const result = schema.safeParse(input);
  if (result.success) throw new Error('Expected the input to be rejected');
  return fieldErrors(result.error);
}

describe('createObligationSchema', () => {
  it('accepts a monthly bill, with or without a payee and an end month', () => {
    expect(createObligationSchema.parse(electricity)).toEqual(electricity);
    const noPayee = without(electricity, 'payee');
    expect(createObligationSchema.parse(noPayee)).toEqual(noPayee);
    expect(createObligationSchema.parse({ ...electricity, endMonth: '2026-12' })).toMatchObject({
      endMonth: '2026-12',
    });
  });

  it('accepts a bill every n months and a bill in chosen months', () => {
    expect(
      createObligationSchema.parse({
        ...electricity,
        recurrence: 'every_n_months',
        everyNMonths: 3,
      }),
    ).toMatchObject({ everyNMonths: 3 });
    expect(
      createObligationSchema.parse({
        ...electricity,
        recurrence: 'custom_months',
        months: [11, 12, 1],
      }),
    ).toMatchObject({ months: [1, 11, 12] });
  });

  it('sorts the chosen months and drops duplicates', () => {
    const parsed = createObligationSchema.parse({
      ...electricity,
      recurrence: 'custom_months',
      months: [12, 3, 12, 1, 3],
    });
    expect(parsed).toMatchObject({ months: [1, 3, 12] });
  });

  it('trims the name and turns an empty payee into none', () => {
    expect(
      createObligationSchema.parse({ ...electricity, name: '  Water  ', payee: '   ' }),
    ).toMatchObject({
      name: 'Water',
      payee: null,
    });
  });

  it('needs a name, not too long', () => {
    expect(errorsOf(createObligationSchema, { ...electricity, name: '   ' })).toHaveProperty(
      'name',
    );
    expect(
      errorsOf(createObligationSchema, {
        ...electricity,
        name: 'x'.repeat(MAX_OBLIGATION_NAME_LENGTH + 1),
      }),
    ).toHaveProperty('name');
    expect(
      createObligationSchema.parse({
        ...electricity,
        name: 'x'.repeat(MAX_OBLIGATION_NAME_LENGTH),
      }),
    ).toBeTruthy();
  });

  it('limits the payee length', () => {
    expect(
      errorsOf(createObligationSchema, { ...electricity, payee: 'x'.repeat(MAX_PAYEE_LENGTH + 1) }),
    ).toHaveProperty('payee');
    expect(
      createObligationSchema.parse({ ...electricity, payee: 'x'.repeat(MAX_PAYEE_LENGTH) }),
    ).toBeTruthy();
  });

  it('needs a real category id', () => {
    expect(errorsOf(createObligationSchema, { ...electricity, categoryId: 'food' })).toHaveProperty(
      'categoryId',
    );
    expect(errorsOf(createObligationSchema, without(electricity, 'categoryId'))).toHaveProperty(
      'categoryId',
    );
  });

  it('needs a whole amount in range', () => {
    for (const expectedAmountMkd of [0, -5, 10.5, MAX_EXPENSE_MKD + 1, '4500', null]) {
      expect(
        errorsOf(createObligationSchema, { ...electricity, expectedAmountMkd }),
      ).toHaveProperty('expectedAmountMkd');
    }
    expect(
      createObligationSchema.parse({ ...electricity, expectedAmountMkd: MAX_EXPENSE_MKD }),
    ).toBeTruthy();
  });

  it('needs a due day from 1 to 31', () => {
    for (const dueDay of [0, 32, 1.5, '15', null]) {
      expect(errorsOf(createObligationSchema, { ...electricity, dueDay })).toHaveProperty('dueDay');
    }
    for (const dueDay of [1, 31]) {
      expect(createObligationSchema.parse({ ...electricity, dueDay })).toBeTruthy();
    }
  });

  it('needs a valid start month and a valid end month', () => {
    expect(
      errorsOf(createObligationSchema, { ...electricity, startMonth: '2026-13' }),
    ).toHaveProperty('startMonth');
    expect(
      errorsOf(createObligationSchema, { ...electricity, startMonth: undefined }),
    ).toHaveProperty('startMonth');
    expect(errorsOf(createObligationSchema, { ...electricity, endMonth: '2026-1' })).toHaveProperty(
      'endMonth',
    );
  });

  it('refuses an end month before the start month, but allows the same month', () => {
    expect(errors(electricity, { endMonth: '2025-12' }).endMonth).toBe(END_BEFORE_START);
    expect(createObligationSchema.parse({ ...electricity, endMonth: '2026-01' })).toBeTruthy();
  });

  it('every n months needs n from 2 to 12', () => {
    for (const everyNMonths of [undefined, null, 0, 1, 13, 2.5, '3']) {
      expect(
        errorsOf(createObligationSchema, {
          ...electricity,
          recurrence: 'every_n_months',
          everyNMonths,
        }),
      ).toHaveProperty('everyNMonths');
    }
    for (const everyNMonths of [2, 12]) {
      expect(
        createObligationSchema.parse({
          ...electricity,
          recurrence: 'every_n_months',
          everyNMonths,
        }),
      ).toBeTruthy();
    }
  });

  it('chosen months need at least one month, each from 1 to 12', () => {
    for (const months of [undefined, [], [0], [13], [1.5], ['1'], 'all']) {
      expect(
        Object.keys(
          errorsOf(createObligationSchema, { ...electricity, recurrence: 'custom_months', months }),
        ).some((key) => key === 'months' || key.startsWith('months')),
      ).toBe(true);
    }
  });

  it('refuses fields of another recurrence and unknown fields', () => {
    expect(() => createObligationSchema.parse({ ...electricity, everyNMonths: 3 })).toThrow();
    expect(() => createObligationSchema.parse({ ...electricity, months: [1] })).toThrow();
    expect(() =>
      createObligationSchema.parse({
        ...electricity,
        recurrence: 'every_n_months',
        everyNMonths: 3,
        months: [1],
      }),
    ).toThrow();
    expect(() => createObligationSchema.parse({ ...electricity, colour: 'red' })).toThrow();
  });

  it('refuses an unknown recurrence', () => {
    expect(
      errorsOf(createObligationSchema, { ...electricity, recurrence: 'weekly' }),
    ).toHaveProperty('recurrence');
    expect(
      errorsOf(createObligationSchema, { ...electricity, recurrence: undefined }),
    ).toHaveProperty('recurrence');
  });

  function errors(base: Record<string, unknown>, over: Record<string, unknown>) {
    return errorsOf(createObligationSchema, { ...base, ...over });
  }
});

describe('updateObligationSchema', () => {
  it('accepts a change of any single field', () => {
    for (const change of [
      { name: 'Power' },
      { payee: 'EVN' },
      { categoryId },
      { expectedAmountMkd: 5_000 },
      { dueDay: 20 },
      { startMonth: '2026-02' },
      { endMonth: '2026-12' },
      { everyNMonths: 4 },
      { months: [3, 1] },
    ]) {
      expect(updateObligationSchema.parse(change)).toBeTruthy();
    }
  });

  it('sorts the chosen months, clears the payee with an empty one, and takes the end away with null', () => {
    expect(updateObligationSchema.parse({ months: [12, 1, 12] })).toEqual({ months: [1, 12] });
    expect(updateObligationSchema.parse({ payee: '  ' })).toEqual({ payee: null });
    expect(updateObligationSchema.parse({ endMonth: null })).toEqual({ endMonth: null });
  });

  it('refuses an empty change and unknown or recurrence fields', () => {
    expect(errorsOf(updateObligationSchema, {})).toBeTruthy();
    expect(() => updateObligationSchema.parse({ recurrence: 'monthly' })).toThrow();
    expect(() => updateObligationSchema.parse({ colour: 'red' })).toThrow();
  });

  it('applies the same rules to each field', () => {
    expect(errorsOf(updateObligationSchema, { dueDay: 32 })).toHaveProperty('dueDay');
    expect(errorsOf(updateObligationSchema, { expectedAmountMkd: 0 })).toHaveProperty(
      'expectedAmountMkd',
    );
    expect(errorsOf(updateObligationSchema, { everyNMonths: 1 })).toHaveProperty('everyNMonths');
    expect(errorsOf(updateObligationSchema, { name: ' ' })).toHaveProperty('name');
    expect(errorsOf(updateObligationSchema, { categoryId: 'x' })).toHaveProperty('categoryId');
  });
});

const mortgage = {
  name: 'Mortgage',
  lender: 'Komercijalna Banka',
  loanType: 'housing',
  principalMkd: 3_000_000,
  annualRateBp: 350,
  categoryId,
  dueDay: 5,
  startMonth: '2026-01',
  endMonth: '2045-12',
};

describe('createLoanSchema', () => {
  it('accepts a loan and keeps the payment optional', () => {
    const result = createLoanSchema.safeParse(mortgage);
    expect(result.success).toBe(true);
    expect(createLoanSchema.safeParse({ ...mortgage, monthlyPaymentMkd: 17_400 }).success).toBe(
      true,
    );
  });

  it('accepts a 0 % loan and a loan that lasts one month', () => {
    expect(createLoanSchema.safeParse({ ...mortgage, annualRateBp: 0 }).success).toBe(true);
    expect(createLoanSchema.safeParse({ ...mortgage, endMonth: '2026-01' }).success).toBe(true);
  });

  it.each([
    ['name', { name: ' ' }],
    ['lender', { lender: '' }],
    ['loanType', { loanType: 'car' }],
    ['principalMkd', { principalMkd: 0 }],
    ['principalMkd', { principalMkd: 1_000_000_001 }],
    ['principalMkd', { principalMkd: 1000.5 }],
    ['annualRateBp', { annualRateBp: -1 }],
    ['annualRateBp', { annualRateBp: 10_001 }],
    ['annualRateBp', { annualRateBp: 4.5 }],
    ['dueDay', { dueDay: 0 }],
    ['startMonth', { startMonth: '2026-13' }],
    ['categoryId', { categoryId: 'food' }],
    ['monthlyPaymentMkd', { monthlyPaymentMkd: 0 }],
  ])('refuses a bad %s', (field, over) => {
    const result = createLoanSchema.safeParse({ ...mortgage, ...over });
    expect(result.success).toBe(false);
    if (!result.success) expect(Object.keys(fieldErrors(result.error))).toContain(field);
  });

  it('needs a last month, and it must not come before the first', () => {
    expect(createLoanSchema.safeParse(without(mortgage, 'endMonth')).success).toBe(false);
    const result = createLoanSchema.safeParse({ ...mortgage, endMonth: '2025-12' });
    expect(result.success).toBe(false);
    if (!result.success) expect(fieldErrors(result.error).endMonth).toBe(END_BEFORE_START);
  });

  it('refuses fields it does not know', () => {
    expect(createLoanSchema.safeParse({ ...mortgage, recurrence: 'monthly' }).success).toBe(false);
  });
});
