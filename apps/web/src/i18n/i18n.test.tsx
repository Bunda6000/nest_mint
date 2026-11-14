import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { formatMkd, formatRate } from '../format';
import { formatMonth } from '../features/spending/months';
import { LanguageSwitch } from './LanguageSwitch';
import { getLanguage, LANGUAGE_KEY, resetLanguage, setLanguage } from './language';
import { en, mk, mkCategoryNames } from './messages';
import { categoryLabel, translate } from './translate';

beforeEach(() => {
  localStorage.clear();
  resetLanguage();
  setLanguage('en');
});
afterEach(() => {
  cleanup();
  setLanguage('en');
});

describe('translate', () => {
  it('uses English by default and fills placeholders', () => {
    expect(translate('en', 'home.hello', { name: 'Filip' })).toBe('Hello, Filip.');
  });

  it('uses Macedonian when there is a translation and English when there is not', () => {
    expect(translate('mk', 'home.hello', { name: 'Filip' })).toBe('Здраво, Filip.');
    expect(translate('mk', 'nav.import' as never)).toBe('Увоз');
    // A key missing from the Macedonian set falls back to English.
    const original = mk['home.net'];
    delete mk['home.net'];
    expect(translate('mk', 'home.net')).toBe(en['home.net']);
    mk['home.net'] = original;
  });

  it('keeps a placeholder that was not given', () => {
    expect(translate('en', 'home.hello')).toBe('Hello, {name}.');
  });

  it('has a Macedonian text only for keys that exist in English', () => {
    for (const key of Object.keys(mk)) expect(key in en).toBe(true);
  });

  it('translates only the exact default category names', () => {
    expect(categoryLabel('mk', 'Electricity')).toBe('Струја');
    expect(categoryLabel('mk', 'My own thing')).toBe('My own thing');
    expect(categoryLabel('en', 'Electricity')).toBe('Electricity');
    expect(Object.keys(mkCategoryNames)).toContain('Groceries');
  });
});

describe('language choice', () => {
  it('is remembered on the device', () => {
    setLanguage('mk');
    expect(localStorage.getItem(LANGUAGE_KEY)).toBe('mk');
    expect(document.documentElement.lang).toBe('mk');
    resetLanguage();
    expect(getLanguage()).toBe('mk');
  });

  it('formats numbers and months for the chosen language', () => {
    expect(formatMkd(127_088)).toBe('127,088 MKD');
    expect(formatRate(0.438)).toBe('43.8%');
    expect(formatMonth('2026-11')).toBe('November 2026');
    setLanguage('mk');
    expect(formatMkd(127_088)).toBe('127.088 MKD');
    expect(formatMonth('2026-11')).toContain('ноември');
  });

  it('switches from the toggle', async () => {
    const user = userEvent.setup();
    render(<LanguageSwitch />);
    expect(screen.getByRole('button', { name: 'EN' }).getAttribute('aria-pressed')).toBe('true');
    await user.click(screen.getByRole('button', { name: 'МК' }));
    expect(getLanguage()).toBe('mk');
    expect(screen.getByRole('group', { name: 'Јазик' })).toBeTruthy();
  });
});
