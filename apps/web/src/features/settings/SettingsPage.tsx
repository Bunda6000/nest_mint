import type { ExchangeRateResponse, ExchangeRatesResponse } from '@nestmint/shared';
import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { ApiError } from '../../api/client';
import { formatDay, localDay } from '../../format';
import { setRates } from '../../rates';
import { useAuth } from '../auth/AuthContext';

type Load =
  { status: 'loading' } | { status: 'error' } | { status: 'ready'; data: ExchangeRatesResponse };

/** NM-36: euro amounts are denars ÷ the rate in force on the day. Add a rate from a date onward. */
export function SettingsPage() {
  const { authedGet, authedSend, logoutEverywhere } = useAuth();
  const [loggingOut, setLoggingOut] = useState(false);
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [day, setDay] = useState(localDay());
  const [rate, setRate] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    authedGet<ExchangeRatesResponse>('/settings/rates')
      .then((data) => {
        if (!active) return;
        setRates(data.rates);
        setLoad({ status: 'ready', data });
      })
      .catch(() => active && setLoad({ status: 'error' }));
    return () => {
      active = false;
    };
  }, [authedGet, attempt]);

  async function run(action: () => Promise<unknown>) {
    if (busy) return;
    setBusy(true);
    setProblem(null);
    try {
      await action();
      setAttempt((n) => n + 1);
    } catch (error) {
      setProblem(
        error instanceof ApiError
          ? (Object.values(error.details)[0] ?? error.message)
          : 'Something went wrong. Please try again.',
      );
    } finally {
      setBusy(false);
    }
  }

  function add(event: FormEvent) {
    event.preventDefault();
    const value = Number(rate.replace(',', '.'));
    if (rate.trim() === '' || !Number.isFinite(value)) return setProblem('Enter the rate');
    void run(async () => {
      await authedSend<ExchangeRateResponse>('PUT', `/settings/rates/${day}`, { mkdPerEur: value });
      setRate('');
    });
  }

  return (
    <section className="mx-auto max-w-md p-4">
      <Link to="/" className="text-emerald-700 underline">
        ← Home
      </Link>
      <h1 className="mt-2 text-xl font-semibold text-gray-900">Currency</h1>
      <p className="mt-1 text-sm text-gray-600">
        Amounts are kept in denars. Euro amounts are denars ÷ the rate in force on the day of the
        entry, so changing a rate never rewrites the past.
      </p>

      {load.status === 'loading' && (
        <p role="status" className="mt-4 text-gray-500">
          Loading…
        </p>
      )}
      {load.status === 'error' && (
        <p role="alert" className="mt-4 text-sm text-red-700">
          Could not load the rates.{' '}
          <button
            type="button"
            className="underline"
            onClick={() => {
              setLoad({ status: 'loading' });
              setAttempt((n) => n + 1);
            }}
          >
            Try again
          </button>
        </p>
      )}

      {load.status === 'ready' && (
        <>
          <ul className="mt-4 divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white text-sm">
            <li className="flex justify-between p-3 text-gray-600">
              <span>Until the first rate below</span>
              <span className="tabular-nums">{load.data.defaultMkdPerEur} MKD / EUR</span>
            </li>
            {load.data.rates.map((entry) => (
              <li key={entry.effectiveFrom} className="flex items-center justify-between gap-2 p-3">
                <span>From {formatDay(entry.effectiveFrom)}</span>
                <span className="tabular-nums">{entry.mkdPerEur} MKD / EUR</span>
                <button
                  type="button"
                  disabled={busy}
                  aria-label={`Delete the rate from ${formatDay(entry.effectiveFrom)}`}
                  onClick={() =>
                    void run(() => authedSend('DELETE', `/settings/rates/${entry.effectiveFrom}`))
                  }
                  className="text-red-700 underline"
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>

          <form onSubmit={add} className="mt-4 space-y-3 text-sm" noValidate>
            <label className="block">
              <span className="text-gray-700">Effective from</span>
              <input
                type="date"
                value={day}
                onChange={(e) => setDay(e.target.value)}
                className="mt-1 block rounded-lg border border-gray-300 px-3 py-2"
              />
            </label>
            <label className="block">
              <span className="text-gray-700">Rate (MKD per EUR)</span>
              <input
                inputMode="decimal"
                value={rate}
                onChange={(e) => setRate(e.target.value)}
                className="mt-1 block w-32 rounded-lg border border-gray-300 px-3 py-2"
              />
            </label>
            {problem && (
              <p role="alert" className="text-red-700">
                {problem}
              </p>
            )}
            <button
              type="submit"
              disabled={busy}
              className="rounded-lg bg-emerald-700 px-4 py-2 text-white disabled:opacity-60"
            >
              Save rate
            </button>
          </form>
        </>
      )}

      <h2 className="mt-8 text-xl font-semibold text-gray-900">Security</h2>
      <p className="mt-1 text-sm text-gray-600">
        Lost a device or used a shared computer? This logs you out on every device, including this
        one.
      </p>
      <button
        type="button"
        disabled={loggingOut}
        onClick={() => {
          setLoggingOut(true);
          logoutEverywhere().catch(() => {
            setLoggingOut(false);
            setProblem('Could not log you out everywhere. Please try again.');
          });
        }}
        className="mt-3 rounded-lg border border-gray-300 px-4 py-2 hover:bg-gray-50 disabled:opacity-60"
      >
        Log out everywhere
      </button>
    </section>
  );
}
