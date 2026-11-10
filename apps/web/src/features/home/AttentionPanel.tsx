import type { BillResponse, BillsInboxResponse } from '@nestmint/shared';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { ApiError } from '../../api/client';
import { localDay } from '../../format';
import { useAuth } from '../auth/AuthContext';
import { describeLate, formatDueDate } from '../obligations/obligationText';
import { needsAttention } from './attention';
import type { Currency } from './currency';
import { formatAmount } from './kpi';

interface AttentionPanelProps {
  currency: Currency;
  /** Called after a bill was paid here, so the numbers on the page can refresh. */
  onPaid: () => void;
}

type Load =
  { status: 'loading' } | { status: 'error' } | { status: 'ready'; bills: BillResponse[] };

/** NM-30: overdue bills and bills due within a week, each with a one-tap "Paid". Nothing shows when all is well. */
export function AttentionPanel({ currency, onPaid }: AttentionPanelProps) {
  const { authedGet, authedSend } = useAuth();
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [paying, setPaying] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const today = localDay();

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        // Catch up first, so a bill that came due since the Bills screen was last opened is here too.
        await authedSend('POST', '/bills/sync', {});
        const [overdue, due] = await Promise.all([
          authedGet<BillsInboxResponse>('/bills/inbox?tab=overdue'),
          authedGet<BillsInboxResponse>('/bills/inbox?tab=due'),
        ]);
        if (active)
          setLoad({ status: 'ready', bills: needsAttention(overdue.bills, due.bills, today) });
      } catch {
        if (active) setLoad({ status: 'error' });
      }
    })();
    return () => {
      active = false;
    };
  }, [authedGet, authedSend, attempt, today]);

  async function pay(bill: BillResponse) {
    if (paying) return;
    setPaying(bill.id);
    setProblem(null);
    try {
      // The day defaults to today and the amount to what the bill costs now.
      await authedSend('POST', `/bills/${bill.id}/pay`, {});
      setAttempt((n) => n + 1);
      onPaid();
    } catch (error) {
      setProblem(
        error instanceof ApiError ? error.message : 'Something went wrong. Please try again.',
      );
    } finally {
      setPaying(null);
    }
  }

  if (load.status === 'loading') return null;

  if (load.status === 'error') {
    return (
      <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
        Could not check your bills.{' '}
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

  if (load.bills.length === 0) return null;

  return (
    <section
      aria-label="Needs attention"
      className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-3"
    >
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="font-medium">Needs attention</h2>
        <Link to="/bills" className="text-sm text-emerald-700 underline">
          All bills
        </Link>
      </div>
      {problem && (
        <p role="alert" className="mt-2 text-sm text-red-700">
          {problem}
        </p>
      )}
      <ul className="mt-2 divide-y divide-amber-200">
        {load.bills.map((bill) => {
          const late = bill.status === 'overdue' ? describeLate(bill.dueDate, today) : '';
          return (
            <li key={bill.id} className="flex items-center gap-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{bill.obligationName}</p>
                <p className={`text-xs ${late ? 'text-red-700' : 'text-gray-600'}`}>
                  {late ? `${late} · was due ${formatDueDate(bill)}` : `Due ${formatDueDate(bill)}`}
                  {' · '}
                  {formatAmount(bill.amountMkd, currency, bill.dueDate.slice(0, 7))}
                </p>
              </div>
              <button
                type="button"
                disabled={paying !== null}
                aria-label={`Mark ${bill.obligationName} as paid`}
                onClick={() => void pay(bill)}
                className="rounded-lg bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
              >
                Paid
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
