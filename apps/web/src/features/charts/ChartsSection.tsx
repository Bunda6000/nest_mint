import type { HistoryResponse, MonthBreakdownResponse } from '@nestmint/shared';
import { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import type { Currency } from '../home/currency';
import { CategoryDonut } from './CategoryDonut';
import { IncomeExpensesChart } from './IncomeExpensesChart';
import { SavingsTrend } from './SavingsTrend';
import { TopExpenses } from './TopExpenses';

type Load =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; breakdown: MonthBreakdownResponse; history: HistoryResponse };

interface Props {
  /** The month shown, "YYYY-MM"; the history ends at it. */
  month: string;
  currency: Currency;
}

const Card = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="rounded-lg border p-4">
    <h3 className="mb-3 text-base font-medium">{title}</h3>
    {children}
  </section>
);

/** The dashboard charts. Loads its own data, so a problem here never hides the numbers above. */
export function ChartsSection({ month, currency }: Props) {
  const { authedGet } = useAuth();
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    Promise.all([
      authedGet<MonthBreakdownResponse>(`/insights/breakdown?month=${month}`),
      authedGet<HistoryResponse>(`/insights/history?month=${month}`),
    ])
      .then(([breakdown, history]) => {
        if (active) setLoad({ status: 'ready', breakdown, history });
      })
      .catch(() => active && setLoad({ status: 'error' }));
    return () => {
      active = false;
    };
  }, [authedGet, month, attempt]);

  if (load.status === 'loading') {
    return (
      <p className="mt-6 text-sm text-gray-500" aria-live="polite">
        Loading charts…
      </p>
    );
  }
  if (load.status === 'error') {
    return (
      <div role="alert" className="mt-6 rounded-lg bg-red-50 p-4 text-sm text-red-700">
        <p>Could not load the charts.</p>
        <button
          type="button"
          onClick={() => {
            setLoad({ status: 'loading' });
            setAttempt((n) => n + 1);
          }}
          className="mt-2 rounded-lg border border-red-300 px-3 py-1.5 hover:bg-red-100"
        >
          Try charts again
        </button>
      </div>
    );
  }
  return (
    <div className="mt-6 space-y-4">
      <Card title="Spending by group">
        <CategoryDonut categories={load.breakdown.categories} currency={currency} month={month} />
      </Card>
      <Card title="Income vs expenses">
        <IncomeExpensesChart months={load.history.months} currency={currency} month={month} />
      </Card>
      <Card title="Savings trend">
        <SavingsTrend months={load.history.months} currency={currency} month={month} />
      </Card>
      <Card title="Top 5 expenses">
        <TopExpenses transactions={load.breakdown.top} currency={currency} month={month} />
      </Card>
    </div>
  );
}
