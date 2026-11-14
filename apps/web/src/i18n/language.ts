import { useSyncExternalStore } from 'react';

export type Language = 'en' | 'mk';

export const LANGUAGES: readonly Language[] = ['en', 'mk'];
export const LANGUAGE_KEY = 'nestmint.language';
const DEFAULT_LANGUAGE: Language = 'en';

/** The locale that numbers and dates are formatted with for each language. */
const LOCALES: Record<Language, string> = { en: 'en-US', mk: 'mk-MK' };

function browserStorage(): Pick<Storage, 'getItem' | 'setItem'> | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function read(): Language {
  try {
    const stored = browserStorage()?.getItem(LANGUAGE_KEY);
    return stored === 'en' || stored === 'mk' ? stored : DEFAULT_LANGUAGE;
  } catch {
    return DEFAULT_LANGUAGE;
  }
}

let current: Language = read();
const listeners = new Set<() => void>();

/** The language in use. English until the user picks another; remembered on this device. */
export const getLanguage = (): Language => current;

export const currentLocale = (): string => LOCALES[current];

export function setLanguage(next: Language): void {
  if (next === current) return;
  current = next;
  try {
    browserStorage()?.setItem(LANGUAGE_KEY, next);
  } catch {
    // Not remembered, but the language still changes for this visit.
  }
  if (typeof document !== 'undefined') document.documentElement.lang = next;
  listeners.forEach((listener) => listener());
}

/** Test helper: forget the choice and go back to what storage says. */
export function resetLanguage(): void {
  current = read();
  listeners.forEach((listener) => listener());
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** The current language; the component re-renders when it changes. */
export function useLanguage(): Language {
  return useSyncExternalStore(subscribe, getLanguage, getLanguage);
}
