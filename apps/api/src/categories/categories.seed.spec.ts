import { describe, expect, it } from 'vitest';
import { DEFAULT_CATEGORY_GROUPS } from './categories.seed.js';

describe('DEFAULT_CATEGORY_GROUPS', () => {
  it('covers every group of the Budget.xlsx "Буџет" sheet, in its order, first', () => {
    const fromSpreadsheet = DEFAULT_CATEGORY_GROUPS.filter((g) => g.spreadsheetName).map(
      (g) => g.spreadsheetName,
    );
    expect(fromSpreadsheet).toEqual([
      'Банки',
      'Дома',
      'Дете',
      'Транспорт',
      'Забава',
      'Online',
      'Останато',
    ]);
    expect(DEFAULT_CATEGORY_GROUPS.slice(0, 7).every((g) => g.spreadsheetName)).toBe(true);
  });

  it('adds the daily-spending groups the spreadsheet never tracked', () => {
    const names = DEFAULT_CATEGORY_GROUPS.map((g) => g.name);
    expect(names).toEqual(expect.arrayContaining(['Food', 'Household', 'Health']));
    const all = DEFAULT_CATEGORY_GROUPS.flatMap((g) => g.categories);
    expect(all).toEqual(expect.arrayContaining(['Groceries', 'Restaurants', 'Fuel']));
  });

  it('has unique group names, unique names inside each group, and no blanks', () => {
    const groupNames = DEFAULT_CATEGORY_GROUPS.map((g) => g.name);
    expect(new Set(groupNames).size).toBe(groupNames.length);
    for (const group of DEFAULT_CATEGORY_GROUPS) {
      expect(group.name.trim()).not.toBe('');
      expect(group.categories.length).toBeGreaterThan(0);
      expect(new Set(group.categories).size).toBe(group.categories.length);
      expect(group.categories.every((name) => name.trim() !== '')).toBe(true);
    }
  });
});
