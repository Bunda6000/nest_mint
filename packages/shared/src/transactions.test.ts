import { describe, expect, it } from 'vitest';
import { fieldErrors } from './auth/register.js';
import { createExpenseSchema, isoDateSchema, MAX_EXPENSE_MKD } from './transactions.js';

const categoryId = 'a3bb189e-8bf9-4888-9912-ace4e6543002';
const valid = { categoryId, amountMkd: 450, occurredOn: '2026-11-08' };

function errorsOf(input: unknown): Record<string, string> {
  const result = createExpenseSchema.safeParse(input);
  if (result.success) throw new Error('Expected the input to be rejected');
  return fieldErrors(result.error);
}

describe('createExpenseSchema', () => {
  it('accepts a minimal expense and trims the note', () => {
    expect(createExpenseSchema.parse(valid)).toEqual(valid);
    expect(createExpenseSchema.parse({ ...valid, note: '  lunch  ' }).note).toBe('lunch');
  });

  it('accepts the smallest and the largest amount', () => {
    expect(createExpenseSchema.safeParse({ ...valid, amountMkd: 1 }).success).toBe(true);
    expect(createExpenseSchema.safeParse({ ...valid, amountMkd: MAX_EXPENSE_MKD }).success).toBe(
      true,
    );
  });

  it('asks for an amount above 0, in whole denars, within the limit', () => {
    expect(errorsOf({ ...valid, amountMkd: 0 })).toEqual({ amountMkd: 'Enter an amount above 0' });
    expect(errorsOf({ ...valid, amountMkd: -5 })).toEqual({ amountMkd: 'Enter an amount above 0' });
    expect(errorsOf({ ...valid, amountMkd: 12.5 })).toEqual({
      amountMkd: 'Enter whole denars, for example 1250',
    });
    expect(errorsOf({ ...valid, amountMkd: MAX_EXPENSE_MKD + 1 }).amountMkd).toContain('at most');
  });

  it('asks for an amount when it is missing or not a number', () => {
    expect(errorsOf({ categoryId, occurredOn: valid.occurredOn })).toEqual({
      amountMkd: 'Enter an amount',
    });
    expect(errorsOf({ ...valid, amountMkd: '450' })).toEqual({ amountMkd: 'Enter an amount' });
    expect(errorsOf({ ...valid, amountMkd: null })).toEqual({ amountMkd: 'Enter an amount' });
  });

  it('asks for a category', () => {
    expect(errorsOf({ ...valid, categoryId: 'nope' })).toEqual({ categoryId: 'Choose a category' });
    expect(errorsOf({ amountMkd: 450, occurredOn: valid.occurredOn }).categoryId).toBeDefined();
  });

  it('limits the note', () => {
    expect(createExpenseSchema.safeParse({ ...valid, note: 'x'.repeat(200) }).success).toBe(true);
    expect(errorsOf({ ...valid, note: 'x'.repeat(201) }).note).toContain('at most 200');
  });
});

describe('isoDateSchema', () => {
  it.each(['2026-11-08', '2000-01-01', '2024-02-29'])('accepts %s', (value) => {
    expect(isoDateSchema.safeParse(value).success).toBe(true);
  });

  it.each(['2026-02-30', '2026-13-01', '2026-00-10', '08.11.2026', '2026-1-1', '', ' 2026-11-08'])(
    'rejects %j',
    (value) => {
      expect(isoDateSchema.safeParse(value).success).toBe(false);
    },
  );

  it('rejects a leap day in a non-leap year and dates before 2000', () => {
    expect(isoDateSchema.safeParse('2025-02-29').success).toBe(false);
    expect(isoDateSchema.safeParse('1999-12-31').success).toBe(false);
  });

  it('asks for a date when it is missing or empty', () => {
    for (const value of [undefined, '']) {
      const result = isoDateSchema.safeParse(value);
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.issues[0]!.message).toBe('Choose a date');
    }
  });

  it('says "valid date" for something typed that is not one', () => {
    const result = isoDateSchema.safeParse('2026-02-30');
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0]!.message).toBe('Choose a valid date');
  });
});
