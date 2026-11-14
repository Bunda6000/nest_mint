import { convertMkdToEur } from '@nestmint/finance-engine';
import type { LedgerResponse } from '@nestmint/shared';
import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { useAuth } from '../auth/AuthContext';
import { formatDay, formatEurCents, formatMkd, localDay } from '../../format';
import { formatMonth } from '../spending/months';

type Load = { status: 'loading' } | { status: 'error' } | { status: 'ready'; data: LedgerResponse };

const eurOf = (amountMkd: number, day: string) =>
  formatEurCents(convertMkdToEur(amountMkd, day).eurCents);

/** The history of one obligation (NM-19): its bills by month for a chosen year, with totals. */
export function LedgerPage() {
  const { id = '' } = useParams();
  const [search, setSearch] = useSearchParams();
  const yearParam = search.get('year');
  const { authedGet } = useAuth();
  const [state, setState] = useState<Load>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    const query = yearParam ? `?year=${encodeURIComponent(yearParam)}` : '';
    authedGet<LedgerResponse>(`/obligations/${id}/ledger${query}`)
      .then((data) => active && setState({ status: 'ready', data }))
      .catch(() => active && setState({ status: 'error' }));
    return () => {
      active = false;
    };
  }, [authedGet, id, yearParam, attempt]);

  const data = state.status === 'ready' ? state.data : null;
  const today = localDay();

  return (
    <section className="mx-auto max-w-md p-6">
      <Link to="/obligations" className="text-sm text-emerald-700 underline">
        ← Recurring bills
      </Link>
      <h1 className="mt-3 text-2xl font-semibold">{data ? data.name : 'History'}</h1>
      {data && (
        <p className="mt-1 text-sm text-gray-500">
          {[data.payee, data.categoryName].filter(Boolean).join(' · ')}
        </p>
      )}

      {state.status === 'loading' && (
        <p className="mt-6 text-gray-500" role="status">
          Loading…
        </p>
      )}

      {state.status === 'error' && (
        <div role="alert" className="mt-6 rounded-lg bg-red-50 p-4 text-sm text-red-700">
          <p>Could not load the history.</p>
          <button
            type="button"
            onClick={() => {
              setState({ status: 'loading' });
              setAttempt((n) => n + 1);
            }}
            className="mt-2 rounded-lg border border-red-300 px-3 py-1.5 hover:bg-red-100"
          >
            Try again
          </button>
        </div>
      )}

      {data && (
        <>
          <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Year">
            {data.years.map((year) => (
              <button
                key={year}
                type="button"
                aria-pressed={year === data.year}
                onClick={() => setSearch({ year: String(year) })}
                className={`rounded-full px-3 py-1.5 text-sm ${
                  year === data.year ? 'bg-emerald-700 text-white' : 'bg-gray-100 text-gray-700'
                }`}
              >
                {year}
              </button>
            ))}
          </div>

          {data.rows.length === 0 ? (
            <p className="mt-4 text-sm text-gray-500">No bills in {data.year}.</p>
          ) : (
            <ul className="mt-4 flex flex-col divide-y rounded-lg border">
              {data.rows.map((row) => (
                <li key={row.billId} className="flex items-start justify-between gap-4 p-3">
                  <div className="min-w-0">
                    <p className="font-medium">{formatMonth(row.period)}</p>
                    <p className="text-xs text-gray-500">
                      {row.paidOn ? `Paid ${formatDay(row.paidOn)}` : 'Not paid yet'}
                      {row.invoiceRef ? ` · ${row.invoiceRef}` : ''}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-medium">{formatMkd(row.amountMkd)}</p>
                    <p className="text-xs text-gray-500">
                      {eurOf(row.amountMkd, row.paidOn ?? row.dueDate)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <dl className="mt-4 grid grid-cols-[1fr_auto] gap-x-4 gap-y-2 rounded-lg bg-gray-50 p-4 text-sm">
            <dt>Billed in {data.year}</dt>
            <dd className="text-right">
              {formatMkd(data.yearTotalMkd)}{' '}
              <span className="text-xs text-gray-500">({eurOf(data.yearTotalMkd, today)})</span>
            </dd>
            <dt>Paid in {data.year}</dt>
            <dd className="text-right">
              {formatMkd(data.yearPaidMkd)}{' '}
              <span className="text-xs text-gray-500">({eurOf(data.yearPaidMkd, today)})</span>
            </dd>
            <dt className="font-medium">All years</dt>
            <dd className="text-right font-medium">
              {formatMkd(data.lifetimeMkd)}{' '}
              <span className="text-xs font-normal text-gray-500">
                ({eurOf(data.lifetimeMkd, today)})
              </span>
            </dd>
          </dl>
        </>
      )}
    </section>
  );
}
