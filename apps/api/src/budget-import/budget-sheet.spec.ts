import { describe, expect, it } from 'vitest';
import { parseBudgetGrid } from './budget-sheet.js';
import { sampleGrid } from './budget-sheet.test-data.js';

describe('parseBudgetGrid', () => {
  const parsed = parseBudgetGrid(sampleGrid(), 2025);

  it('reads income lines by month, leaving empty cells out', () => {
    expect(parsed.income.map((l) => [l.name, l.totalMkd])).toEqual([
      ['Плата', 381_264],
      ['Друго', 19_220],
    ]);
    expect(parsed.income[0]!.amountsMkd).toEqual({
      '2025-01': 127_088,
      '2025-02': 127_088,
      '2025-03': 127_088,
    });
    expect(parsed.incomeTotalMkd).toBe(400_484);
  });

  it('reads expense lines with their block and skips labels with nothing entered', () => {
    expect(parsed.expenses.map((l) => [l.section, l.name, l.totalMkd])).toEqual([
      ['Банки', 'Станбен', 30_937],
      ['Банки', 'Кеш', 1_900],
      ['Транспорт', 'Гориво', 4_200],
    ]);
    expect(parsed.monthlyExpensesMkd).toEqual({ '2025-01': 21_537, '2025-03': 15_500 });
  });

  it('accepts the sheet totals when they match its lines', () => {
    expect(parsed.warnings).toEqual([]);
  });

  it('warns, without correcting, when a total row disagrees with its lines', () => {
    const grid = sampleGrid().map((row) => [...row]);
    grid[5]![2] = 999; // January income "Вкупно"
    const result = parseBudgetGrid(grid, 2025);
    expect(result.warnings).toEqual([
      "Прилив, 2025-01: the sheet's total is 999 but its lines add up to 146308",
    ]);
    expect(result.incomeTotalMkd).toBe(400_484);
  });

  it('returns nothing for a sheet without month headers', () => {
    expect(parseBudgetGrid([['x', 'y']], 2025)).toMatchObject({ income: [], expenses: [] });
  });
});
