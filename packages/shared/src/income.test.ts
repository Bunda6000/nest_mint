import { describe, expect, it } from 'vitest';
import { fieldErrors } from './auth/register.js';
import {
  createIncomeSchema,
  END_BEFORE_START,
  MAX_INCOME_NAME_LENGTH,
  updateIncomeSchema,
} from './income.js';
import { MAX_EXPENSE_MKD } from './transactions.js';

const salary = {
  recurrence: 'monthly',
  name: 'Salary',
  amountMkd: 120_000,
  startMonth: '2026-01',
  payDay: 25,
};
const bonus = { recurrence: 'one_off', name: 'Bonus', amountMkd: 30_000, receivedOn: '2026-11-03' };

function errorsOf(schema: typeof createIncomeSchema | typeof updateIncomeSchema, input: unknown) {
  const result = schema.safeParse(input);
  if (result.success) throw new Error('Expected the input to be rejected');
  return fieldErrors(result.error);
}

describe('createIncomeSchema', () => {
  it('accepts a monthly salary, with or without an end month', () => {
    expect(createIncomeSchema.parse(salary)).toEqual(salary);
    expect(createIncomeSchema.parse({ ...salary, endMonth: '2026-12' })).toEqual({
      ...salary,
      endMonth: '2026-12',
    });
    expect(createIncomeSchema.parse({ ...salary, endMonth: null })).toMatchObject({
      endMonth: null,
    });
    expect(createIncomeSchema.parse({ ...salary, endMonth: '2026-01' }).recurrence).toBe('monthly');
  });

  it('accepts one-off income', () => {
    expect(createIncomeSchema.parse(bonus)).toEqual(bonus);
  });

  it('trims the name and limits its length', () => {
    expect(createIncomeSchema.parse({ ...bonus, name: '  Refund  ' }).name).toBe('Refund');
    expect(
      createIncomeSchema.safeParse({ ...bonus, name: 'x'.repeat(MAX_INCOME_NAME_LENGTH) }).success,
    ).toBe(true);
    expect(errorsOf(createIncomeSchema, { ...bonus, name: 'x'.repeat(61) }).name).toContain(
      'at most 60',
    );
    expect(errorsOf(createIncomeSchema, { ...bonus, name: '   ' })).toEqual({
      name: 'Enter a name',
    });
    expect(errorsOf(createIncomeSchema, { ...bonus, name: undefined })).toEqual({
      name: 'Enter a name',
    });
  });

  it('applies the amount rules of expenses', () => {
    expect(errorsOf(createIncomeSchema, { ...bonus, amountMkd: 0 })).toEqual({
      amountMkd: 'Enter an amount above 0',
    });
    expect(errorsOf(createIncomeSchema, { ...bonus, amountMkd: 1.5 }).amountMkd).toContain(
      'whole denars',
    );
    expect(
      errorsOf(createIncomeSchema, { ...bonus, amountMkd: MAX_EXPENSE_MKD + 1 }).amountMkd,
    ).toContain('at most');
    expect(errorsOf(createIncomeSchema, { ...bonus, amountMkd: '5' })).toEqual({
      amountMkd: 'Enter an amount',
    });
  });

  it('asks for a valid pay day, 1 to 31', () => {
    for (const payDay of [1, 31]) {
      expect(createIncomeSchema.safeParse({ ...salary, payDay }).success).toBe(true);
    }
    for (const payDay of [0, 32, -1, 12.5]) {
      expect(Object.keys(errorsOf(createIncomeSchema, { ...salary, payDay }))).toEqual(['payDay']);
    }
    expect(errorsOf(createIncomeSchema, { ...salary, payDay: undefined })).toEqual({
      payDay: 'Choose the day of the month',
    });
  });

  it('checks the months and the date', () => {
    expect(errorsOf(createIncomeSchema, { ...salary, startMonth: '2026-13' })).toEqual({
      startMonth: 'Choose a valid month',
    });
    expect(errorsOf(createIncomeSchema, { ...salary, endMonth: 'soon' })).toEqual({
      endMonth: 'Choose a valid month',
    });
    expect(errorsOf(createIncomeSchema, { ...bonus, receivedOn: '2026-02-30' })).toEqual({
      receivedOn: 'Choose a valid date',
    });
  });

  it('refuses an end month before the start month, but accepts the same month', () => {
    expect(errorsOf(createIncomeSchema, { ...salary, endMonth: '2025-12' })).toEqual({
      endMonth: END_BEFORE_START,
    });
    expect(createIncomeSchema.safeParse({ ...salary, endMonth: '2026-01' }).success).toBe(true);
  });

  it('asks to choose a recurrence when it is missing or unknown', () => {
    for (const recurrence of [undefined, 'weekly', null]) {
      expect(errorsOf(createIncomeSchema, { ...bonus, recurrence })).toEqual({
        recurrence: 'Choose monthly or one-off',
      });
    }
  });

  it('refuses fields of the other recurrence and unknown fields', () => {
    expect(createIncomeSchema.safeParse({ ...bonus, payDay: 5 }).success).toBe(false);
    expect(createIncomeSchema.safeParse({ ...salary, receivedOn: '2026-11-03' }).success).toBe(
      false,
    );
    expect(createIncomeSchema.safeParse({ ...salary, userId: 'someone' }).success).toBe(false);
  });
});

describe('updateIncomeSchema', () => {
  it('accepts any single field, or several', () => {
    expect(updateIncomeSchema.parse({ amountMkd: 130_000 })).toEqual({ amountMkd: 130_000 });
    expect(updateIncomeSchema.parse({ endMonth: '2026-12' })).toEqual({ endMonth: '2026-12' });
    expect(updateIncomeSchema.parse({ name: ' Pay ', payDay: 1, startMonth: '2026-02' })).toEqual({
      name: 'Pay',
      payDay: 1,
      startMonth: '2026-02',
    });
  });

  it('lets the end month be taken away with null', () => {
    expect(updateIncomeSchema.parse({ endMonth: null })).toEqual({ endMonth: null });
  });

  it('refuses an empty change, the recurrence and unknown fields', () => {
    expect(errorsOf(updateIncomeSchema, {})).toEqual({ form: 'Nothing to change' });
    expect(errorsOf(updateIncomeSchema, { endMonth: undefined })).toEqual({
      form: 'Nothing to change',
    });
    expect(updateIncomeSchema.safeParse({ amountMkd: 5, recurrence: 'one_off' }).success).toBe(
      false,
    );
    expect(updateIncomeSchema.safeParse({ amountMkd: 5, userId: 'x' }).success).toBe(false);
  });

  it('applies the same field rules as adding', () => {
    expect(errorsOf(updateIncomeSchema, { amountMkd: 0 }).amountMkd).toBeDefined();
    expect(errorsOf(updateIncomeSchema, { payDay: 40 }).payDay).toBeDefined();
    expect(errorsOf(updateIncomeSchema, { name: '' }).name).toBeDefined();
    expect(errorsOf(updateIncomeSchema, { startMonth: '2026-1' }).startMonth).toBeDefined();
    expect(errorsOf(updateIncomeSchema, { receivedOn: '2026-02-30' }).receivedOn).toBeDefined();
  });
});
