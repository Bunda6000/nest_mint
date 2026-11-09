import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CURRENCY_KEY, readCurrency, saveCurrency } from './currency';

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe('readCurrency', () => {
  it('is euro when nothing is stored', () => {
    expect(readCurrency()).toBe('EUR');
  });

  it('gives back what was saved', () => {
    saveCurrency('MKD');
    expect(readCurrency()).toBe('MKD');
    saveCurrency('EUR');
    expect(readCurrency()).toBe('EUR');
  });

  it('stores it under one key as plain text', () => {
    saveCurrency('MKD');
    expect(localStorage.getItem(CURRENCY_KEY)).toBe('MKD');
  });

  it.each(['', 'USD', 'eur', 'mkd', '{}', 'null'])(
    'falls back to euro for a stored %j',
    (value) => {
      localStorage.setItem(CURRENCY_KEY, value);
      expect(readCurrency()).toBe('EUR');
    },
  );

  it('falls back to euro when storage cannot be read, without throwing', () => {
    const blocked = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => undefined,
    };
    expect(readCurrency(blocked)).toBe('EUR');
  });

  it('falls back to euro when there is no storage at all', () => {
    expect(readCurrency(null)).toBe('EUR');
  });
});

describe('saveCurrency', () => {
  it('does not throw when storage refuses to save', () => {
    const full = {
      getItem: () => null,
      setItem: () => {
        throw new Error('quota');
      },
    };
    expect(() => saveCurrency('MKD', full)).not.toThrow();
  });

  it('does not throw when there is no storage', () => {
    expect(() => saveCurrency('MKD', null)).not.toThrow();
  });
});
