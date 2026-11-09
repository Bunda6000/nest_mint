import { useState } from 'react';

export type Currency = 'EUR' | 'MKD';

export const CURRENCY_KEY = 'nestmint.currency';
const DEFAULT_CURRENCY: Currency = 'EUR';

type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem'>;

/** The browser's storage, or null where it is blocked (private mode, strict settings). */
function browserStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** The currency chosen last on this device; euro when nothing valid is stored. Never throws. */
export function readCurrency(storage: Storage | null = browserStorage()): Currency {
  try {
    const stored = storage?.getItem(CURRENCY_KEY);
    return stored === 'EUR' || stored === 'MKD' ? stored : DEFAULT_CURRENCY;
  } catch {
    return DEFAULT_CURRENCY;
  }
}

/** Remembers the choice on this device. If storage refuses, the choice just lasts for this visit. */
export function saveCurrency(currency: Currency, storage: Storage | null = browserStorage()): void {
  try {
    storage?.setItem(CURRENCY_KEY, currency);
  } catch {
    // Nothing to do: the toggle still works, it is only not remembered.
  }
}

/** The shown currency and a setter that also remembers the choice. */
export function useCurrency(): [Currency, (currency: Currency) => void] {
  const [currency, setCurrency] = useState<Currency>(() => readCurrency());
  return [
    currency,
    (next) => {
      setCurrency(next);
      saveCurrency(next);
    },
  ];
}
