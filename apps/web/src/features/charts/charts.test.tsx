import { cleanup, render, screen, within } from '@testing-library/react';
import type {
  CategoryTotalResponse,
  HistoryMonthResponse,
  TransactionResponse,
} from '@nestmint/shared';
import { afterEach, describe, expect, it } from 'vitest';
import { CategoryDonut } from './CategoryDonut';
import { IncomeExpensesChart } from './IncomeExpensesChart';
import { SavingsTrend } from './SavingsTrend';
import { TopExpenses } from './TopExpenses';

afterEach(cleanup);

const category = (name: string, group: string, amountMkd: number): CategoryTotalResponse => ({
  categoryId: `c-${name}`,
  categoryName: name,
  groupId: `g-${group}`,
  groupName: group,
  amountMkd,
});

describe('CategoryDonut', () => {
  it('shows one legend line per group, adding up its categories, biggest first', () => {
    render(
      <CategoryDonut
        month="2026-11"
        currency="MKD"
        categories={[
          category('Groceries', 'Food', 30_000),
          category('Mortgage', 'Banks', 40_000),
          category('Restaurants', 'Food', 10_000),
        ]}
      />,
    );
    const lines = screen.getAllByRole('listitem').map((li) => li.textContent);
    expect(lines).toEqual(['Banks40,000 MKD50%', 'Food40,000 MKD50%']);
  });

  it('shows euros at the rate of the month and the total in the middle', () => {
    const { container } = render(
      <CategoryDonut
        month="2026-11"
        currency="EUR"
        categories={[category('Groceries', 'Food', 61_500), category('Doctor', 'Health', 61_500)]}
      />,
    );
    const lines = screen.getAllByRole('listitem').map((li) => li.textContent);
    expect(lines).toEqual(['Food€1,000.0050%', 'Health€1,000.0050%']);
    expect(container.querySelector('svg text')!.textContent).toBe('€2,000.00');
  });

  it('describes the donut in words for a screen reader', () => {
    render(
      <CategoryDonut
        month="2026-11"
        currency="MKD"
        categories={[category('Groceries', 'Food', 75), category('Doctor', 'Health', 25)]}
      />,
    );
    expect(screen.getByRole('img').getAttribute('aria-label')).toBe(
      'Spending by group in November 2026: Food 75%, Health 25%',
    );
  });

  it('draws one coloured slice per legend line, each with its own colour', () => {
    const { container } = render(
      <CategoryDonut
        month="2026-11"
        currency="MKD"
        categories={[category('a', 'A', 50), category('b', 'B', 30), category('c', 'C', 20)]}
      />,
    );
    const fills = [...container.querySelectorAll('path')].map((p) => p.getAttribute('fill'));
    expect(fills).toHaveLength(3);
    expect(new Set(fills).size).toBe(3);
  });

  it('merges the smallest groups into "Other" so there are never more than six', () => {
    const groups = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
    render(
      <CategoryDonut
        month="2026-11"
        currency="MKD"
        categories={groups.map((g, i) => category(g.toLowerCase(), g, 1_000 - i * 100))}
      />,
    );
    const lines = screen.getAllByRole('listitem').map((li) => li.textContent);
    expect(lines).toHaveLength(6);
    expect(lines[5]).toMatch(/^Other/);
    // The five biggest keep their own slice; F, G and H (500 + 400 + 300) are merged.
    expect(lines[5]).toContain('1,200 MKD');
  });

  it('gives "Other" a grey that no group uses', () => {
    const groups = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
    const { container } = render(
      <CategoryDonut
        month="2026-11"
        currency="MKD"
        categories={groups.map((g, i) => category(g, g, 1_000 - i * 10))}
      />,
    );
    const fills = [...container.querySelectorAll('path')].map((p) => p.getAttribute('fill'));
    expect(fills.at(-1)).toBe('#9ca3af');
    expect(fills.slice(0, -1)).not.toContain('#9ca3af');
  });

  it('draws one group as a whole ring at 100%', () => {
    const { container } = render(
      <CategoryDonut month="2026-11" currency="MKD" categories={[category('a', 'A', 500)]} />,
    );
    expect(container.querySelectorAll('path')).toHaveLength(1);
    expect(screen.getByRole('listitem').textContent).toBe('A500 MKD100%');
  });

  it('shows "<1%" for a sliver instead of 0%', () => {
    render(
      <CategoryDonut
        month="2026-11"
        currency="MKD"
        categories={[category('big', 'Big', 99_900), category('tiny', 'Tiny', 100)]}
      />,
    );
    expect(screen.getAllByRole('listitem')[1]!.textContent).toBe('Tiny100 MKD<1%');
  });

  it('says so when nothing was spent', () => {
    render(<CategoryDonut month="2026-11" currency="MKD" categories={[]} />);
    expect(screen.getByText('No spending in November 2026.')).toBeTruthy();
    expect(screen.queryByRole('img')).toBeNull();
  });
});

function twelveMonths(over: (index: number) => Partial<HistoryMonthResponse> = () => ({})) {
  let running = 0;
  return Array.from({ length: 12 }, (_, i): HistoryMonthResponse => {
    const month = `${i < 2 ? 2025 : 2026}-${String(((i + 11) % 12) + 1).padStart(2, '0')}`;
    const base = { month, incomeMkd: 100_000, expensesMkd: 60_000, ...over(i) };
    const netMkd = (base.incomeMkd ?? 0) - (base.expensesMkd ?? 0);
    running += netMkd;
    return {
      month,
      incomeMkd: base.incomeMkd!,
      expensesMkd: base.expensesMkd!,
      netMkd,
      cumulativeNetMkd: running,
      savingsRate: base.incomeMkd ? netMkd / base.incomeMkd : null,
    };
  });
}

describe('IncomeExpensesChart', () => {
  it('draws an income bar and an expenses bar for each of the twelve months', () => {
    const { container } = render(
      <IncomeExpensesChart months={twelveMonths()} currency="MKD" month="2026-11" />,
    );
    expect(container.querySelectorAll('svg rect')).toHaveLength(24);
    expect(container.querySelectorAll('svg text')).toHaveLength(12);
  });

  it('draws the biggest value at full height and others in proportion', () => {
    const { container } = render(
      <IncomeExpensesChart
        months={twelveMonths((i) => (i === 0 ? { incomeMkd: 200_000, expensesMkd: 50_000 } : {}))}
        currency="MKD"
        month="2026-11"
      />,
    );
    const heights = [...container.querySelectorAll('svg rect')].map((r) =>
      Number(r.getAttribute('height')),
    );
    expect(heights[0]).toBe(110);
    expect(heights[1]).toBe(27.5);
    expect(heights[2]).toBe(55);
  });

  it('writes each month name under the middle of its pair of bars, oldest on the left', () => {
    const { container } = render(
      <IncomeExpensesChart months={twelveMonths()} currency="MKD" month="2026-11" />,
    );
    const labels = [...container.querySelectorAll('svg text')];
    expect(labels.map((t) => t.textContent).slice(0, 3)).toEqual(['Dec', 'Jan', 'Feb']);
    expect(labels.at(-1)!.textContent).toBe('Nov');
    expect(labels.map((t) => Number(t.getAttribute('x'))).slice(0, 3)).toEqual([15, 45, 75]);
    expect(Number(labels.at(-1)!.getAttribute('x'))).toBe(345);
  });

  it('colours income green and expenses red', () => {
    const { container } = render(
      <IncomeExpensesChart months={twelveMonths()} currency="MKD" month="2026-11" />,
    );
    const rects = container.querySelectorAll('svg rect');
    expect(rects[0]!.getAttribute('fill')).toBe('#047857');
    expect(rects[1]!.getAttribute('fill')).toBe('#dc2626');
  });

  it('has a table with the exact figures in the chosen currency', () => {
    render(<IncomeExpensesChart months={twelveMonths()} currency="EUR" month="2026-11" />);
    const rows = within(screen.getByRole('table')).getAllByRole('row');
    expect(rows).toHaveLength(13);
    expect(rows[1]!.textContent).toBe('December 2025€1,626.02€975.61');
    expect(rows[12]!.textContent).toBe('November 2026€1,626.02€975.61');
    expect(screen.getByRole('img').getAttribute('aria-label')).toContain('November 2026');
  });

  it('copes with a year of nothing', () => {
    const { container } = render(
      <IncomeExpensesChart
        months={twelveMonths(() => ({ incomeMkd: 0, expensesMkd: 0 }))}
        currency="MKD"
        month="2026-11"
      />,
    );
    expect(container.innerHTML).not.toMatch(/NaN|Infinity/);
  });
});

describe('SavingsTrend', () => {
  it('shows the running total of the last month', () => {
    render(<SavingsTrend months={twelveMonths()} currency="MKD" month="2026-11" />);
    expect(screen.getByText(/Running total:/).textContent).toBe('Running total: 480,000 MKD');
  });

  it('shows the running total in euros at the rate of the month', () => {
    render(<SavingsTrend months={twelveMonths()} currency="EUR" month="2026-11" />);
    expect(screen.getByText(/Running total:/).textContent).toBe('Running total: €7,804.88');
  });

  it('colours a month that gained green and a month that lost red', () => {
    const { container } = render(
      <SavingsTrend
        months={twelveMonths((i) => (i === 3 ? { expensesMkd: 150_000 } : {}))}
        currency="MKD"
        month="2026-11"
      />,
    );
    const fills = [...container.querySelectorAll('svg rect')].map((r) => r.getAttribute('fill'));
    expect(fills).toHaveLength(12);
    expect(fills[3]).toBe('#dc2626');
    expect(fills.filter((f) => f === '#047857')).toHaveLength(11);
  });

  it('writes each month name under the middle of its bar, oldest on the left', () => {
    const { container } = render(
      <SavingsTrend months={twelveMonths()} currency="MKD" month="2026-11" />,
    );
    const labels = [...container.querySelectorAll('svg text')];
    expect(labels.map((t) => t.textContent).slice(0, 3)).toEqual(['Dec', 'Jan', 'Feb']);
    expect(labels.map((t) => Number(t.getAttribute('x'))).slice(0, 3)).toEqual([15, 45, 75]);
    expect(Number(labels.at(-1)!.getAttribute('x'))).toBe(345);
  });

  it('draws a line with a point for every month', () => {
    const { container } = render(
      <SavingsTrend months={twelveMonths()} currency="MKD" month="2026-11" />,
    );
    const points = container.querySelector('polyline')!.getAttribute('points')!.split(' ');
    expect(points).toHaveLength(12);
  });

  it('draws the zero line below the bars when nothing was lost, and above them when all was lost', () => {
    const gain = render(<SavingsTrend months={twelveMonths()} currency="MKD" month="2026-11" />);
    const gainZero = Number(gain.container.querySelector('line')!.getAttribute('y1'));
    gain.unmount();
    const loss = render(
      <SavingsTrend
        months={twelveMonths(() => ({ incomeMkd: 0, expensesMkd: 10_000 }))}
        currency="MKD"
        month="2026-11"
      />,
    );
    const lossZero = Number(loss.container.querySelector('line')!.getAttribute('y1'));
    expect(gainZero).toBeGreaterThan(lossZero);
  });

  it('has a table with net and running total for every month', () => {
    render(<SavingsTrend months={twelveMonths()} currency="MKD" month="2026-11" />);
    const rows = within(screen.getByRole('table')).getAllByRole('row');
    expect(rows).toHaveLength(13);
    expect(rows[1]!.textContent).toBe('December 202540,000 MKD40,000 MKD');
    expect(rows[12]!.textContent).toBe('November 202640,000 MKD480,000 MKD');
  });

  it('copes with a year of nothing', () => {
    const { container } = render(
      <SavingsTrend
        months={twelveMonths(() => ({ incomeMkd: 0, expensesMkd: 0 }))}
        currency="MKD"
        month="2026-11"
      />,
    );
    expect(container.innerHTML).not.toMatch(/NaN|Infinity/);
  });
});

const tx = (
  id: string,
  amountMkd: number,
  over: Partial<TransactionResponse> = {},
): TransactionResponse => ({
  id,
  kind: 'expense',
  categoryId: 'c1',
  categoryName: 'Groceries',
  amountMkd,
  occurredOn: '2026-11-02',
  note: null,
  ...over,
});

describe('TopExpenses', () => {
  it('lists the transactions in the order given, numbered, with category, day and amount', () => {
    render(
      <TopExpenses
        month="2026-11"
        currency="MKD"
        transactions={[
          tx('a', 9_000),
          tx('b', 4_000, { categoryName: 'Doctor', occurredOn: '2026-11-15' }),
        ]}
      />,
    );
    const items = screen.getAllByRole('listitem').map((li) => li.textContent);
    expect(items).toEqual(['1GroceriesNov 29,000 MKD', '2DoctorNov 154,000 MKD']);
  });

  it('shows the note as the title when there is one, with the category under it', () => {
    render(
      <TopExpenses
        month="2026-11"
        currency="MKD"
        transactions={[tx('a', 9_000, { note: 'Weekly shop', categoryName: 'Groceries' })]}
      />,
    );
    expect(screen.getByRole('listitem').textContent).toBe('1Weekly shopGroceries · Nov 29,000 MKD');
  });

  it('marks a cash withdrawal', () => {
    render(
      <TopExpenses
        month="2026-11"
        currency="MKD"
        transactions={[
          tx('a', 20_000, { kind: 'cash_withdrawal', categoryName: 'Cash withdrawal' }),
        ]}
      />,
    );
    expect(screen.getByRole('listitem').textContent).toBe(
      '1Cash withdrawalNov 2 · Cash withdrawal20,000 MKD',
    );
  });

  it('shows euros at the rate of the month', () => {
    render(<TopExpenses month="2026-11" currency="EUR" transactions={[tx('a', 61_500)]} />);
    expect(screen.getByRole('listitem').textContent).toContain('€1,000.00');
  });

  it('says so when nothing was spent', () => {
    render(<TopExpenses month="2026-11" currency="MKD" transactions={[]} />);
    expect(screen.getByText('No spending in November 2026.')).toBeTruthy();
    expect(screen.queryByRole('list')).toBeNull();
  });
});
