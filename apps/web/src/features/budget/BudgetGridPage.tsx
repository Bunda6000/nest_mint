import type { BudgetGridResponse } from '@nestmint/shared';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { useAuth } from '../auth/AuthContext';
import { type Currency, useCurrency } from '../home/currency';
import { currentMonth } from '../spending/months';
import { GridTable } from './GridTable';

type Load =
  { status: 'loading' } | { status: 'error' } | { status: 'ready'; grid: BudgetGridResponse };

const CURRENCIES: Currency[] = ['EUR', 'MKD'];
const FIRST_YEAR = 2000;

/** NM-27b: the year at a glance, groups by twelve months, planned against actual. */
export function BudgetGridPage() {
  const { authedGet } = useAuth();
  const thisYear = Number(currentMonth().slice(0, 4));
  const [year, setYear] = useState(thisYear);
  const [currency, setCurrency] = useCurrency();
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    authedGet<BudgetGridResponse>(`/budget?year=${year}`)
      .then((grid) => active && setLoad({ status: 'ready', grid }))
      .catch(() => active && setLoad({ status: 'error' }));
    return () => {
      active = false;
    };
  }, [authedGet, year, attempt]);

  function goTo(next: number) {
    setLoad({ status: 'loading' });
    setYear(next);
  }

  return (
    <section className="mx-auto max-w-6xl p-4">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Budget</h1>
          <p className="mt-1 text-sm text-gray-500">
            What came in and went out each month, by group. Payments count on the day they were
            made.
          </p>
        </div>
        <Link to="/" className="text-sm text-emerald-700 underline">
          Home
        </Link>
      </header>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label="Previous year"
            onClick={() => goTo(year - 1)}
            disabled={year <= FIRST_YEAR}
            className="rounded-lg border border-gray-300 px-3 py-1.5 disabled:opacity-40"
          >
            ◀
          </button>
          <h2 aria-live="polite" className="min-w-16 text-center text-lg font-medium">
            {year}
          </h2>
          <button
            type="button"
            aria-label="Next year"
            onClick={() => goTo(year + 1)}
            disabled={year >= thisYear}
            className="rounded-lg border border-gray-300 px-3 py-1.5 disabled:opacity-40"
          >
            ▶
          </button>
        </div>
        <div role="group" aria-label="Currency" className="flex gap-2">
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
      </div>

      {load.status === 'loading' && (
        <p className="mt-6 text-gray-500" role="status">
          Loading…
        </p>
      )}

      {load.status === 'error' && (
        <div role="alert" className="mt-6 rounded-lg bg-red-50 p-4 text-sm text-red-700">
          <p>Could not load the budget.</p>
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
          <GridTable grid={load.grid} currency={currency} />
          <p className="mt-3 text-xs text-gray-500">
            Amounts in {currency === 'EUR' ? 'euros' : 'denars'}. "plan" is what bills are expected
            to cost; groups without bills have no plan. Red means more was spent than planned.
          </p>
        </>
      )}
    </section>
  );
}
