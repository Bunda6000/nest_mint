import { compareMonths, type MonthlySummary } from '@nestmint/finance-engine';
import type { MonthSummaryResponse } from '@nestmint/shared';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { formatRate } from '../../format';
import { useAuth } from '../auth/AuthContext';
import { ChartsSection } from '../charts/ChartsSection';
import { currentMonth, formatMonth, shiftMonth } from '../spending/months';
import { type Currency, useCurrency } from './currency';
import { amountChangeView, formatAmount, rateChangeView } from './kpi';
import { KpiCard } from './KpiCard';

type Load =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; current: MonthlySummary; previous: MonthlySummary };

const toSummary = (response: MonthSummaryResponse): MonthlySummary => ({
  income: response.incomeMkd,
  expenses: response.expensesMkd,
  net: response.netMkd,
  savingsRate: response.savingsRate,
});

/** A month with neither income nor spending has nothing to compare with. */
const hasData = (summary: MonthlySummary) => summary.income > 0 || summary.expenses > 0;

const CURRENCIES: Currency[] = ['EUR', 'MKD'];

export function HomePage() {
  const { state, logout, authedGet } = useAuth();
  const name = state.status === 'authenticated' ? (state.user.displayName ?? state.user.email) : '';

  const thisMonth = currentMonth();
  const [month, setMonth] = useState(thisMonth);
  const [currency, setCurrency] = useCurrency();
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const previousMonth = shiftMonth(month, -1);

  useEffect(() => {
    let active = true;
    Promise.all([
      authedGet<MonthSummaryResponse>(`/summary?month=${month}`),
      authedGet<MonthSummaryResponse>(`/summary?month=${shiftMonth(month, -1)}`),
    ])
      .then(([current, previous]) => {
        if (active) {
          setLoad({
            status: 'ready',
            current: toSummary(current),
            previous: toSummary(previous),
          });
        }
      })
      .catch(() => active && setLoad({ status: 'error' }));
    return () => {
      active = false;
    };
  }, [authedGet, month, attempt]);

  function goTo(next: string) {
    setLoad({ status: 'loading' });
    setMonth(next);
  }

  const comparison =
    load.status === 'ready' && hasData(load.previous)
      ? compareMonths(load.current, load.previous)
      : null;

  return (
    <section className="mx-auto max-w-md p-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">NestMint</h1>
          <p className="mt-1 text-sm text-gray-500">Hello, {name}.</p>
        </div>
        <button
          type="button"
          onClick={() => void logout()}
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50"
        >
          Log out
        </button>
      </header>

      <div className="mt-6 flex items-center justify-between gap-2">
        <button
          type="button"
          aria-label="Previous month"
          onClick={() => goTo(shiftMonth(month, -1))}
          className="rounded-lg border border-gray-300 px-3 py-1.5"
        >
          ◀
        </button>
        <h2 aria-live="polite" className="text-lg font-medium">
          {formatMonth(month)}
        </h2>
        <button
          type="button"
          aria-label="Next month"
          onClick={() => goTo(shiftMonth(month, 1))}
          disabled={month >= thisMonth}
          className="rounded-lg border border-gray-300 px-3 py-1.5 disabled:opacity-40"
        >
          ▶
        </button>
      </div>

      <div role="group" aria-label="Currency" className="mt-3 flex justify-center gap-2">
        {CURRENCIES.map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={currency === option}
            onClick={() => setCurrency(option)}
            className="rounded-full bg-gray-100 px-3 py-1 text-sm text-gray-700 aria-pressed:bg-emerald-700 aria-pressed:text-white"
          >
            {option}
          </button>
        ))}
      </div>

      {load.status === 'loading' && (
        <p className="mt-6 text-gray-500" role="status">
          Loading…
        </p>
      )}

      {load.status === 'error' && (
        <div role="alert" className="mt-6 rounded-lg bg-red-50 p-4 text-sm text-red-700">
          <p>Could not load this month.</p>
          <button
            type="button"
            onClick={() => {
              setLoad({ status: 'loading' });
              setAttempt((n) => n + 1);
            }}
            className="mt-2 rounded-lg border border-red-300 px-3 py-1.5 hover:bg-red-100"
          >
            Try again
          </button>
        </div>
      )}

      {load.status === 'ready' && (
        <>
          <div className="mt-4 grid grid-cols-2 gap-4">
            <KpiCard
              label="Income"
              value={formatAmount(load.current.income, currency, month)}
              change={
                comparison
                  ? amountChangeView('income', comparison.income, currency, month)
                  : undefined
              }
            />
            <KpiCard
              label="Expenses"
              value={formatAmount(load.current.expenses, currency, month)}
              change={
                comparison
                  ? amountChangeView('expenses', comparison.expenses, currency, month)
                  : undefined
              }
            />
            <KpiCard
              label="Net"
              value={formatAmount(load.current.net, currency, month)}
              change={
                comparison ? amountChangeView('net', comparison.net, currency, month) : undefined
              }
            />
            <KpiCard
              label="Savings rate"
              value={formatRate(load.current.savingsRate)}
              change={comparison ? rateChangeView(comparison.savingsRate) : undefined}
            />
          </div>
          <p className="mt-3 text-xs text-gray-500">
            {comparison
              ? `Change compared with ${formatMonth(previousMonth)}.`
              : `No data in ${formatMonth(previousMonth)} to compare with.`}
          </p>
          {!hasData(load.current) && (
            <p className="mt-3 text-sm text-gray-500">
              Nothing recorded in {formatMonth(month)} yet.
            </p>
          )}
          <ChartsSection key={month} month={month} currency={currency} />
        </>
      )}

      <Link
        to="/expenses/new"
        className="mt-6 block rounded-lg bg-emerald-700 px-4 py-3 text-center font-medium text-white"
      >
        Add expense
      </Link>
      <nav className="mt-4 flex gap-4">
        <Link to="/transactions" className="text-emerald-700 underline">
          Expenses
        </Link>
        <Link to="/income" className="text-emerald-700 underline">
          Income
        </Link>
        <Link to="/categories" className="text-emerald-700 underline">
          Categories
        </Link>
      </nav>
    </section>
  );
}
