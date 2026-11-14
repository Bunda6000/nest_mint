import type { BalanceCheckInResponse, BalanceCheckInStatusResponse } from '@nestmint/shared';
import { useEffect, useState, type FormEvent } from 'react';
import { ApiError } from '../../api/client';
import { formatMkd } from '../../format';
import { useAuth } from '../auth/AuthContext';
import { parseAmount } from '../spending/amount';
import { formatMonth } from '../spending/months';

interface Props {
  /** The month shown on the dashboard, "YYYY-MM". Render with `key={month}` so a new month starts fresh. */
  month: string;
}

type Load =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; data: BalanceCheckInStatusResponse };

/** Reads a typed balance as whole denars; a leading minus is allowed (an overdraft). */
function parseBalance(text: string): { value: number } | { message: string } | null {
  const trimmed = text.trim();
  const negative = trimmed.startsWith('-');
  const parsed = parseAmount(negative ? trimmed.slice(1) : trimmed);
  if (parsed.status === 'empty') return null;
  if (parsed.status === 'invalid') return { message: parsed.message };
  return { value: negative ? -parsed.value : parsed.value };
}

/** NM-31: type the real balance of the main account; the app says how much money it cannot explain. */
export function BalanceCheckInPanel({ month }: Props) {
  const { authedGet, authedSend } = useAuth();
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [editing, setEditing] = useState(false);
  const [closing, setClosing] = useState('');
  const [opening, setOpening] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    authedGet<BalanceCheckInStatusResponse>(`/balance-check-ins?month=${month}`)
      .then((data) => active && setLoad({ status: 'ready', data }))
      .catch(() => active && setLoad({ status: 'error' }));
    return () => {
      active = false;
    };
  }, [authedGet, month, attempt]);

  if (load.status === 'loading') return null;

  if (load.status === 'error') {
    return (
      <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
        Could not load the balance check.{' '}
        <button
          type="button"
          onClick={() => {
            setLoad({ status: 'loading' });
            setAttempt((n) => n + 1);
          }}
          className="underline"
        >
          Try again
        </button>
      </p>
    );
  }

  const { checkIn, needsOpening } = load.data;
  const showForm = checkIn === null || editing;
  // With a saved first check-in the opening balance is already known; only a new one asks for it.
  const askOpening = needsOpening;

  async function save(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    const close = parseBalance(closing);
    if (close === null) return setProblem('Enter the balance of your account');
    if ('message' in close) return setProblem(close.message);
    const body: { closingBalanceMkd: number; openingBalanceMkd?: number } = {
      closingBalanceMkd: close.value,
    };
    if (askOpening) {
      const open = parseBalance(opening);
      if (open === null) return setProblem('Enter the balance at the start of the month');
      if ('message' in open) return setProblem(open.message);
      body.openingBalanceMkd = open.value;
    }
    setSaving(true);
    setProblem(null);
    try {
      const saved = await authedSend<BalanceCheckInResponse>(
        'PUT',
        `/balance-check-ins/${month}`,
        body,
      );
      setLoad({ status: 'ready', data: { month, checkIn: saved, needsOpening: false } });
      setEditing(false);
    } catch (error) {
      setProblem(
        error instanceof ApiError ? error.message : 'Something went wrong. Please try again.',
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <section
      aria-label="Balance check"
      className={`mt-4 rounded-lg border p-4 text-sm ${
        checkIn?.alert ? 'border-amber-300 bg-amber-50' : 'border-gray-200 bg-white'
      }`}
    >
      <h3 className="font-medium text-gray-900">Balance check · {formatMonth(month)}</h3>

      {checkIn && (
        <div className="mt-2 space-y-1 text-gray-700">
          <p role={checkIn.alert ? 'alert' : undefined} className="font-medium">
            {checkIn.untrackedMkd > 0
              ? `${formatMkd(checkIn.untrackedMkd)} of spending is not recorded`
              : checkIn.untrackedMkd < 0
                ? `${formatMkd(-checkIn.untrackedMkd)} more in the account than recorded`
                : 'Your records match the account'}
            {checkIn.alert && ' — more than 10% of your income'}
          </p>
          <p>
            Expected {formatMkd(checkIn.expectedMkd)} (opening {formatMkd(checkIn.openingMkd)} +
            income {formatMkd(checkIn.incomeMkd)} − expenses {formatMkd(checkIn.expensesMkd)}), in
            the account {formatMkd(checkIn.closingMkd)}.
          </p>
          {!editing && (
            <button
              type="button"
              onClick={() => {
                setClosing(String(checkIn.closingMkd));
                setEditing(true);
              }}
              className="underline"
            >
              Change balance
            </button>
          )}
        </div>
      )}

      {showForm && (
        <form onSubmit={save} className="mt-2 space-y-2" noValidate>
          {!checkIn && (
            <p className="text-gray-600">
              Type what your main salary account holds at the end of the month. The app will show
              how much money it cannot explain.
            </p>
          )}
          {askOpening && (
            <label className="block">
              <span className="text-gray-700">Balance at the start of the month (MKD)</span>
              <input
                inputMode="numeric"
                value={opening}
                onChange={(e) => setOpening(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2"
              />
            </label>
          )}
          <label className="block">
            <span className="text-gray-700">Balance at the end of the month (MKD)</span>
            <input
              inputMode="numeric"
              value={closing}
              onChange={(e) => setClosing(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2"
            />
          </label>
          {problem && (
            <p role="alert" className="text-red-700">
              {problem}
            </p>
          )}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-emerald-700 px-3 py-1.5 text-white disabled:opacity-60"
            >
              {saving ? 'Saving…' : 'Check'}
            </button>
            {editing && (
              <button
                type="button"
                onClick={() => {
                  setEditing(false);
                  setProblem(null);
                }}
                className="rounded-lg border border-gray-300 px-3 py-1.5"
              >
                Cancel
              </button>
            )}
          </div>
        </form>
      )}
    </section>
  );
}
