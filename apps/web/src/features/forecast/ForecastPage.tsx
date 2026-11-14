import type { ForecastResponse, HistoryMonthResponse } from '@nestmint/shared';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { formatMkd } from '../../format';
import { useAuth } from '../auth/AuthContext';
import { SavingsTrend } from '../charts/SavingsTrend';
import { formatMonth } from '../spending/months';
import { ScenarioPanel } from './ScenarioPanel';
import { AskCoach } from './AskCoach';
import { type IdeaPreset, SavingsIdeas } from './SavingsIdeas';

const HORIZONS = [3, 6, 12, 24] as const;

type Load =
  { status: 'loading' } | { status: 'error' } | { status: 'ready'; data: ForecastResponse };

/** Phase 3: where the money goes if things stay as they are, for 3, 6, 12 or 24 months. */
export function ForecastPage() {
  const { authedGet } = useAuth();
  const [months, setMonths] = useState<number>(12);
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [preset, setPreset] = useState<{ key: number; value: IdeaPreset } | null>(null);

  useEffect(() => {
    let active = true;
    authedGet<ForecastResponse>(`/forecast?months=${months}`)
      .then((data) => active && setLoad({ status: 'ready', data }))
      .catch(() => active && setLoad({ status: 'error' }));
    return () => {
      active = false;
    };
  }, [authedGet, months, attempt]);

  const data = load.status === 'ready' ? load.data : null;
  const chartMonths: HistoryMonthResponse[] =
    data?.forecast.months.map((m) => ({
      month: m.month,
      incomeMkd: m.incomeMkd,
      expensesMkd: m.expensesMkd,
      netMkd: m.netMkd,
      cumulativeNetMkd: m.cumulativeNetMkd,
      savingsRate: m.incomeMkd === 0 ? null : m.netMkd / m.incomeMkd,
    })) ?? [];

  return (
    <section className="mx-auto max-w-md p-4">
      <Link to="/" className="text-emerald-700 underline">
        ← Home
      </Link>
      <h1 className="mt-2 text-2xl font-semibold">Forecast</h1>

      <div role="group" aria-label="Months to forecast" className="mt-3 flex gap-2">
        {HORIZONS.map((h) => (
          <button
            key={h}
            type="button"
            aria-pressed={months === h}
            onClick={() => {
              setLoad({ status: 'loading' });
              setMonths(h);
            }}
            className={`rounded-lg border px-3 py-1.5 text-sm ${months === h ? 'border-emerald-700 bg-emerald-50' : 'border-gray-300'}`}
          >
            {h} months
          </button>
        ))}
      </div>

      {load.status === 'loading' && (
        <p role="status" className="mt-4 text-gray-500">
          Calculating…
        </p>
      )}
      {load.status === 'error' && (
        <p role="alert" className="mt-4 text-sm text-red-700">
          Could not load the forecast.{' '}
          <button type="button" className="underline" onClick={() => setAttempt((n) => n + 1)}>
            Try again
          </button>
        </p>
      )}

      {data && (
        <>
          <div className="mt-4 rounded-lg border p-4 text-sm">
            <p>
              If things stay as they are, in {months} months you will have put aside{' '}
              <strong>{formatMkd(data.forecast.totalNetMkd)}</strong>
              {data.forecast.endBalanceMkd !== null && (
                <>
                  , and your account will hold{' '}
                  <strong>{formatMkd(data.forecast.endBalanceMkd)}</strong>
                </>
              )}
              .
            </p>
            <p className="mt-2 text-gray-600">
              Income as entered ({formatMkd(data.forecast.totalIncomeMkd)} in total), spending at
              your usual {formatMkd(data.usualExpensesMkd)} a month
              {data.basedOnMonths.length > 0
                ? `, the average of ${data.basedOnMonths.map((m) => formatMonth(m)).join(', ')}`
                : ' (no past spending yet, so 0)'}
              .
              {data.startingBalanceMkd === null
                ? ' Save a balance check-in on the home screen to also see your account balance.'
                : ` The balance starts from your check-in of ${formatMonth(data.startingBalanceFrom!)}.`}
            </p>
          </div>

          <div className="mt-4">
            <SavingsTrend
              months={chartMonths}
              currency="MKD"
              month={chartMonths.at(-1)?.month ?? '2026-01'}
            />
          </div>

          <AskCoach />

          <SavingsIdeas onTry={(value) => setPreset({ key: (preset?.key ?? 0) + 1, value })} />

          <ScenarioPanel key={preset?.key ?? 0} months={months} preset={preset?.value} />
        </>
      )}
    </section>
  );
}
