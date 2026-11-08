import { describe, expect, it } from 'vitest';
import { fieldErrors } from './auth/register.js';
import {
  createExpenseSchema,
  isoDateSchema,
  MAX_EXPENSE_MKD,
  monthSchema,
  updateExpenseSchema,
} from './transactions.js';

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

describe('kind when adding', () => {
  it('is optional, and accepts expense or cash_withdrawal', () => {
    expect(createExpenseSchema.parse(valid).kind).toBeUndefined();
    expect(createExpenseSchema.parse({ ...valid, kind: 'expense' }).kind).toBe('expense');
    expect(createExpenseSchema.parse({ ...valid, kind: 'cash_withdrawal' }).kind).toBe(
      'cash_withdrawal',
    );
  });

  it('refuses anything else', () => {
    expect(errorsOf({ ...valid, kind: 'income' })).toEqual({
      kind: 'Choose expense or cash withdrawal',
    });
    expect(errorsOf({ ...valid, kind: null }).kind).toBeDefined();
  });
});

describe('updateExpenseSchema', () => {
  const changed = (input: unknown): Record<string, string> => {
    const result = updateExpenseSchema.safeParse(input);
    if (result.success) throw new Error('Expected the input to be rejected');
    return fieldErrors(result.error);
  };

  it('accepts any single field, or several', () => {
    expect(updateExpenseSchema.parse({ amountMkd: 500 })).toEqual({ amountMkd: 500 });
    expect(updateExpenseSchema.parse({ occurredOn: '2026-11-01' })).toEqual({
      occurredOn: '2026-11-01',
    });
    expect(updateExpenseSchema.parse({ categoryId })).toEqual({ categoryId });
    expect(
      updateExpenseSchema.parse({ amountMkd: 5, note: 'x', occurredOn: '2026-11-01' }),
    ).toEqual({
      amountMkd: 5,
      note: 'x',
      occurredOn: '2026-11-01',
    });
  });

  it('lets the note be cleared with null or an empty text, and trims it', () => {
    expect(updateExpenseSchema.parse({ note: null })).toEqual({ note: null });
    expect(updateExpenseSchema.parse({ note: '' })).toEqual({ note: '' });
    expect(updateExpenseSchema.parse({ note: '  hi  ' })).toEqual({ note: 'hi' });
  });

  it('refuses an empty change', () => {
    expect(changed({})).toEqual({ form: 'Nothing to change' });
    expect(changed({ note: undefined })).toEqual({ form: 'Nothing to change' });
  });

  it('applies the same rules as adding', () => {
    expect(changed({ amountMkd: 0 })).toEqual({ amountMkd: 'Enter an amount above 0' });
    expect(changed({ amountMkd: 1.5 })).toEqual({
      amountMkd: 'Enter whole denars, for example 1250',
    });
    expect(changed({ amountMkd: MAX_EXPENSE_MKD + 1 }).amountMkd).toContain('at most');
    expect(changed({ occurredOn: '2026-02-30' })).toEqual({ occurredOn: 'Choose a valid date' });
    expect(changed({ categoryId: 'nope' })).toEqual({ categoryId: 'Choose a category' });
    expect(changed({ note: 'x'.repeat(201) }).note).toContain('at most 200');
  });

  it('refuses to change the kind, and unknown fields', () => {
    expect(updateExpenseSchema.safeParse({ amountMkd: 5, kind: 'cash_withdrawal' }).success).toBe(
      false,
    );
    expect(updateExpenseSchema.safeParse({ amountMkd: 5, userId: 'someone-else' }).success).toBe(
      false,
    );
  });
});

describe('monthSchema', () => {
  it.each(['2026-11', '2026-01', '2026-12', '2000-01'])('accepts %s', (value) => {
    expect(monthSchema.safeParse(value).success).toBe(true);
  });

  it.each(['2026-13', '2026-00', '2026-1', '2026', '2026-11-01', 'Nov 2026', '', '1999-12'])(
    'rejects %j',
    (value) => {
      expect(monthSchema.safeParse(value).success).toBe(false);
    },
  );

  it('asks for a month when missing', () => {
    const result = monthSchema.safeParse(undefined);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0]!.message).toBe('Choose a month');
  });
});
