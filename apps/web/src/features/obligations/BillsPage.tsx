import {
  type BillResponse,
  type BillsInboxResponse,
  type BillStatus,
  MAX_BULK_PAY,
} from '@nestmint/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { ApiError } from '../../api/client';
import { formatMkd, localDay } from '../../format';
import { useAuth } from '../auth/AuthContext';
import type { BillDetailsValues } from './BillDetailsForm';
import type { PaymentValues } from './BillPayForm';
import { BillsList } from './BillsList';
import { BulkPayBar } from './BulkPayBar';

type Load =
  { status: 'loading' } | { status: 'error' } | { status: 'ready'; inbox: BillsInboxResponse };

const TABS: ReadonlyArray<{ id: BillStatus; label: string }> = [
  { id: 'due', label: 'Due' },
  { id: 'overdue', label: 'Overdue' },
  { id: 'paid', label: 'Paid' },
];

const EMPTY: Record<BillStatus, string> = {
  due: 'Nothing is due. Bills appear here by themselves from your recurring bills.',
  overdue: 'Nothing is overdue.',
  paid: 'No bills paid yet.',
};

/**
 * The bills inbox: Due, Overdue and Paid. Opening it first catches up (creates every bill that
 * should exist, so a month you skipped still shows its unpaid bills as overdue), then shows a tab.
 */
export function BillsPage() {
  const { authedGet, authedSend } = useAuth();
  const today = localDay();
  const [tab, setTab] = useState<BillStatus>('due');
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const [counts, setCounts] = useState<Record<BillStatus, number> | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [rowOpen, setRowOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const caughtUp = useRef(false);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!caughtUp.current) {
        await authedSend('POST', '/bills/sync', {});
        caughtUp.current = true;
      }
      return authedGet<BillsInboxResponse>(`/bills/inbox?tab=${tab}&asOf=${today}`);
    })()
      .then((inbox) => {
        if (!active) return;
        setLoad({ status: 'ready', inbox });
        setCounts(inbox.counts);
      })
      .catch(() => active && setLoad({ status: 'error' }));
    return () => {
      active = false;
    };
  }, [authedGet, authedSend, tab, today, attempt]);

  /** Shows the current list again after a change; whatever was open is closed. */
  const reload = useCallback(() => {
    setSelected(new Set());
    setRowOpen(false);
    setBulkOpen(false);
    setAttempt((n) => n + 1);
  }, []);

  function chooseTab(next: BillStatus) {
    if (next === tab) return;
    setNotice(null);
    setSelected(new Set());
    setRowOpen(false);
    setBulkOpen(false);
    setLoad({ status: 'loading' });
    setTab(next);
  }

  /**
   * Runs a change. When the bill is gone or already changed (on another device) the list is shown
   * again with a note; any other error goes back to the form, which shows it.
   */
  async function change(action: () => Promise<unknown>) {
    setNotice(null);
    try {
      await action();
    } catch (error) {
      if (error instanceof ApiError && (error.code === 'CONFLICT' || error.code === 'NOT_FOUND')) {
        setNotice(`${error.message} The list is up to date now.`);
        reload();
        return;
      }
      throw error;
    }
    reload();
  }

  const pay = (id: string, values: PaymentValues) =>
    change(() => authedSend('POST', `/bills/${id}/pay`, values));
  const saveDetails = (id: string, values: BillDetailsValues) =>
    change(() => authedSend('PATCH', `/bills/${id}`, values));
  const undo = (id: string) => change(() => authedSend('POST', `/bills/${id}/undo-payment`, {}));
  const payMany = (paidOn: string) =>
    change(() => authedSend('POST', '/bills/pay', { billIds: [...selected], paidOn }));

  const bills: BillResponse[] = load.status === 'ready' ? load.inbox.bills : [];
  const unpaidTab = tab !== 'paid';
  const chosen = bills.filter((bill) => selected.has(bill.id));
  const chosenTotal = chosen.reduce((sum, bill) => sum + bill.amountMkd, 0);
  const allChosen = bills.length > 0 && chosen.length === Math.min(bills.length, MAX_BULK_PAY);

  function select(id: string, value: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      if (value) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  return (
    <section className="mx-auto max-w-md p-6">
      <Link to="/" className="text-sm text-emerald-700 underline">
        ← Back
      </Link>
      <div className="mt-3 flex items-baseline justify-between gap-3">
        <h1 className="text-2xl font-semibold">Bills</h1>
        <Link to="/obligations" className="text-sm text-emerald-700 underline">
          Recurring bills
        </Link>
      </div>

      <div
        role="tablist"
        aria-label="Bills"
        className="mt-4 grid grid-cols-3 gap-1 rounded-lg bg-gray-100 p-1"
      >
        {TABS.map(({ id, label }) => {
          const count = counts?.[id];
          const alarming = id === 'overdue' && (count ?? 0) > 0;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              id={`bills-tab-${id}`}
              aria-selected={tab === id}
              aria-controls="bills-panel"
              onClick={() => chooseTab(id)}
              className={`rounded-md px-2 py-2 text-sm font-medium ${
                tab === id ? 'bg-white shadow-sm' : 'text-gray-600'
              } ${alarming ? 'text-red-700' : ''}`}
            >
              {label}
              {count !== undefined ? ` (${count})` : ''}
            </button>
          );
        })}
      </div>

      <div id="bills-panel" role="tabpanel" aria-labelledby={`bills-tab-${tab}`}>
        {notice && (
          <p role="status" className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
            {notice}
          </p>
        )}

        {load.status === 'loading' && (
          <p className="mt-6 text-gray-500" role="status">
            Loading…
          </p>
        )}

        {load.status === 'error' && (
          <div role="alert" className="mt-6 rounded-lg bg-red-50 p-4 text-sm text-red-700">
            <p>Could not load your bills.</p>
            <button
              type="button"
              onClick={() => {
                setLoad({ status: 'loading' });
                reload();
              }}
              className="mt-2 rounded-lg border border-red-300 px-3 py-1.5 hover:bg-red-100"
            >
              Try again
            </button>
          </div>
        )}

        {load.status === 'ready' && bills.length === 0 && (
          <p className="mt-6 text-sm text-gray-500">{EMPTY[tab]}</p>
        )}

        {load.status === 'ready' && bills.length > 0 && (
          <>
            {unpaidTab && bills.length > 1 && (
              <label className="mt-4 flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={allChosen}
                  disabled={rowOpen || bulkOpen}
                  onChange={(event) =>
                    setSelected(
                      event.target.checked
                        ? new Set(bills.slice(0, MAX_BULK_PAY).map((bill) => bill.id))
                        : new Set(),
                    )
                  }
                  className="size-4"
                />
                Select all
              </label>
            )}

            {unpaidTab && chosen.length > 0 && (
              <BulkPayBar
                count={chosen.length}
                totalMkd={chosenTotal}
                disabled={rowOpen}
                onPay={payMany}
                onOpen={setBulkOpen}
              />
            )}

            <BillsList
              bills={bills}
              today={today}
              selected={selected}
              locked={rowOpen || bulkOpen}
              onSelect={select}
              onOpen={setRowOpen}
              onPay={pay}
              onSaveDetails={saveDetails}
              onUndo={undo}
            />

            {unpaidTab ? (
              <p className="mt-2 text-right text-sm text-gray-600">
                Total:{' '}
                <span className="font-medium">
                  {formatMkd(bills.reduce((sum, bill) => sum + bill.amountMkd, 0))}
                </span>
              </p>
            ) : (
              counts &&
              counts.paid > bills.length && (
                <p className="mt-2 text-sm text-gray-500">
                  Showing the latest {bills.length} of {counts.paid} payments.
                </p>
              )
            )}
          </>
        )}
      </div>
    </section>
  );
}
