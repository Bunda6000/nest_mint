import { describe, expect, it } from 'vitest';
import { fieldErrors } from './auth/register.js';
import {
  billStatusSchema,
  MAX_BULK_PAY,
  MAX_INVOICE_REF_LENGTH,
  payBillSchema,
  payBillsSchema,
  updateBillSchema,
} from './bills.js';
import { MAX_EXPENSE_MKD } from './transactions.js';

const id = (n: number) => `3f0f6c1e-8d6a-4b7e-9c55-0a1b2c3d4e${String(n).padStart(2, '0')}`;

function errorsOf(
  schema: typeof payBillSchema | typeof payBillsSchema | typeof updateBillSchema,
  input: unknown,
) {
  const result = schema.safeParse(input);
  if (result.success) throw new Error('Expected the input to be rejected');
  return fieldErrors(result.error);
}

describe('billStatusSchema', () => {
  it('accepts the three tabs and nothing else', () => {
    for (const tab of ['due', 'overdue', 'paid']) expect(billStatusSchema.parse(tab)).toBe(tab);
    for (const bad of ['', 'Due', 'late', undefined, null, 1]) {
      expect(billStatusSchema.safeParse(bad).success).toBe(false);
    }
  });
});

describe('payBillSchema', () => {
  it('accepts nothing at all (day and amount default), a day, an amount, or both', () => {
    expect(payBillSchema.parse({})).toEqual({});
    expect(payBillSchema.parse({ paidOn: '2026-11-09' })).toEqual({ paidOn: '2026-11-09' });
    expect(payBillSchema.parse({ amountMkd: 4_820 })).toEqual({ amountMkd: 4_820 });
    expect(payBillSchema.parse({ paidOn: '2026-11-09', amountMkd: 4_820 })).toEqual({
      paidOn: '2026-11-09',
      amountMkd: 4_820,
    });
  });

  it('refuses a day that is not a real day', () => {
    for (const paidOn of ['2026-02-30', '2026-13-01', 'today', '09.11.2026', 20261109]) {
      expect(errorsOf(payBillSchema, { paidOn })).toHaveProperty('paidOn');
    }
  });

  it('refuses an amount that is not a whole number of denars in range', () => {
    for (const amountMkd of [0, -1, 10.5, MAX_EXPENSE_MKD + 1, '4500', null]) {
      expect(errorsOf(payBillSchema, { amountMkd })).toHaveProperty('amountMkd');
    }
    expect(payBillSchema.parse({ amountMkd: MAX_EXPENSE_MKD })).toBeTruthy();
    expect(payBillSchema.parse({ amountMkd: 1 })).toBeTruthy();
  });

  it('refuses unknown fields', () => {
    expect(() => payBillSchema.parse({ status: 'paid' })).toThrow();
    expect(() => payBillSchema.parse({ transactionId: id(1) })).toThrow();
  });
});

describe('payBillsSchema', () => {
  it('accepts one or several bills, with or without a day', () => {
    expect(payBillsSchema.parse({ billIds: [id(1)] })).toEqual({ billIds: [id(1)] });
    expect(payBillsSchema.parse({ billIds: [id(1), id(2)], paidOn: '2026-11-09' })).toEqual({
      billIds: [id(1), id(2)],
      paidOn: '2026-11-09',
    });
  });

  it('needs at least one bill', () => {
    expect(errorsOf(payBillsSchema, { billIds: [] })).toHaveProperty('billIds');
    expect(errorsOf(payBillsSchema, {})).toHaveProperty('billIds');
    expect(errorsOf(payBillsSchema, { billIds: 'x' })).toHaveProperty('billIds');
  });

  it('allows at most the limit', () => {
    const many = (n: number) => Array.from({ length: n }, (_, i) => id(i));
    expect(payBillsSchema.parse({ billIds: many(MAX_BULK_PAY) })).toBeTruthy();
    expect(Object.keys(errorsOf(payBillsSchema, { billIds: many(MAX_BULK_PAY + 1) }))).toContain(
      'billIds',
    );
  });

  it('refuses the same bill twice and ids that are not ids', () => {
    expect(errorsOf(payBillsSchema, { billIds: [id(1), id(1)] })).toHaveProperty('billIds');
    expect(
      Object.keys(errorsOf(payBillsSchema, { billIds: [id(1), 'nope'] })).some((k) =>
        k.startsWith('billIds'),
      ),
    ).toBe(true);
  });

  it('refuses a bad day and unknown fields (a bulk payment has no amounts)', () => {
    expect(errorsOf(payBillsSchema, { billIds: [id(1)], paidOn: '2026-02-30' })).toHaveProperty(
      'paidOn',
    );
    expect(() => payBillsSchema.parse({ billIds: [id(1)], amountMkd: 100 })).toThrow();
  });
});

describe('updateBillSchema', () => {
  it('accepts an amount, a reference, or both', () => {
    expect(updateBillSchema.parse({ actualAmountMkd: 4_820 })).toEqual({ actualAmountMkd: 4_820 });
    expect(updateBillSchema.parse({ invoiceRef: 'INV-2026/118' })).toEqual({
      invoiceRef: 'INV-2026/118',
    });
    expect(updateBillSchema.parse({ actualAmountMkd: 4_820, invoiceRef: 'A1' })).toEqual({
      actualAmountMkd: 4_820,
      invoiceRef: 'A1',
    });
  });

  it('takes the amount away with null and clears the reference with null or empty text', () => {
    expect(updateBillSchema.parse({ actualAmountMkd: null })).toEqual({ actualAmountMkd: null });
    expect(updateBillSchema.parse({ invoiceRef: null })).toEqual({ invoiceRef: null });
    expect(updateBillSchema.parse({ invoiceRef: '   ' })).toEqual({ invoiceRef: null });
  });

  it('trims the reference and limits its length', () => {
    expect(updateBillSchema.parse({ invoiceRef: '  A-1  ' })).toEqual({ invoiceRef: 'A-1' });
    expect(updateBillSchema.parse({ invoiceRef: 'x'.repeat(MAX_INVOICE_REF_LENGTH) })).toBeTruthy();
    expect(
      errorsOf(updateBillSchema, { invoiceRef: 'x'.repeat(MAX_INVOICE_REF_LENGTH + 1) }),
    ).toHaveProperty('invoiceRef');
  });

  it('refuses a bad amount', () => {
    for (const actualAmountMkd of [0, -5, 10.5, MAX_EXPENSE_MKD + 1, '4500']) {
      expect(errorsOf(updateBillSchema, { actualAmountMkd })).toHaveProperty('actualAmountMkd');
    }
  });

  it('refuses an empty change and unknown fields', () => {
    expect(errorsOf(updateBillSchema, {})).toBeTruthy();
    expect(() => updateBillSchema.parse({ expectedAmountMkd: 100 })).toThrow();
    expect(() => updateBillSchema.parse({ status: 'paid' })).toThrow();
    // A real field next to an unknown one must not slip through silently.
    expect(() => updateBillSchema.parse({ invoiceRef: 'A-1', status: 'paid' })).toThrow();
    expect(() => updateBillSchema.parse({ actualAmountMkd: 5, transactionId: 'x' })).toThrow();
  });
});
