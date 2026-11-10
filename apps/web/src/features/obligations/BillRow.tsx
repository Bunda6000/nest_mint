import { convertMkdToEur } from '@nestmint/finance-engine';
import type { BillResponse } from '@nestmint/shared';
import { useState } from 'react';
import { ApiError } from '../../api/client';
import { formatDay, formatEurCents, formatMkd } from '../../format';
import { BillDetailsForm, type BillDetailsValues } from './BillDetailsForm';
import { BillPayForm, type PaymentValues } from './BillPayForm';
import { describeLate, formatDueDate } from './obligationText';

interface BillRowProps {
  bill: BillResponse;
  /** The phone's own day, "YYYY-MM-DD". */
  today: string;
  selected: boolean;
  /** Another action (a row, or paying several) is open, so this row waits. */
  locked: boolean;
  onSelect: (selected: boolean) => void;
  /** Called when this row opens or closes a form. */
  onOpen: (open: boolean) => void;
  onPay: (values: PaymentValues) => Promise<void>;
  onSaveDetails: (values: BillDetailsValues) => Promise<void>;
  onUndo: () => Promise<void>;
}

type Mode = 'view' | 'pay' | 'details' | 'undo';

const small =
  'rounded-lg border border-gray-300 px-2 py-1 text-sm hover:bg-gray-50 disabled:opacity-40';

/** One bill: what it is and costs, and what can be done with it (pay, enter details, undo). */
export function BillRow(props: BillRowProps) {
  const { bill, today, locked } = props;
  const [mode, setMode] = useState<Mode>('view');
  const [problem, setProblem] = useState<string | null>(null);
  const [undoing, setUndoing] = useState(false);
  const paid = bill.status === 'paid';

  const open = (next: Mode) => {
    setMode(next);
    setProblem(null);
    props.onOpen(next !== 'view');
  };
  const close = () => open('view');

  const euro = formatEurCents(
    convertMkdToEur(bill.amountMkd, bill.paidOn ?? bill.dueDate).eurCents,
  );
  const late = bill.status === 'overdue' ? describeLate(bill.dueDate, today) : '';

  async function undo() {
    if (undoing) return;
    setUndoing(true);
    setProblem(null);
    try {
      await props.onUndo();
    } catch (error) {
      setProblem(
        error instanceof ApiError ? error.message : 'Something went wrong. Please try again.',
      );
      setUndoing(false);
    }
  }

  return (
    <li className="p-3">
      <div className="flex items-start gap-3">
        {!paid && (
          <input
            type="checkbox"
            checked={props.selected}
            disabled={locked || mode !== 'view'}
            onChange={(event) => props.onSelect(event.target.checked)}
            aria-label={`Select ${bill.obligationName}, due ${formatDueDate(bill)}`}
            className="mt-1 size-4 shrink-0"
          />
        )}
        <div className="min-w-0 flex-1">
          <p className="font-medium">{bill.obligationName}</p>
          <p className="text-xs text-gray-500">
            {paid ? `Paid ${formatDay(bill.paidOn!)}` : `Due ${formatDueDate(bill)}`}
            {bill.payee ? ` · ${bill.payee}` : ''}
          </p>
          {late && <p className="text-xs font-medium text-red-700">{late}</p>}
          {bill.invoiceRef && <p className="text-xs text-gray-500">Invoice {bill.invoiceRef}</p>}
          {!paid && bill.actualAmountMkd !== null && (
            <p className="text-xs text-gray-500">
              Actual amount (expected {formatMkd(bill.expectedAmountMkd)})
            </p>
          )}
        </div>
        <div className="shrink-0 text-right">
          <p className="font-medium">{formatMkd(bill.amountMkd)}</p>
          <p className="text-xs text-gray-500">{euro}</p>
        </div>
      </div>

      {mode === 'view' && (
        <div className="mt-2 flex flex-wrap justify-end gap-2">
          {paid ? (
            <button
              type="button"
              disabled={locked}
              onClick={() => open('undo')}
              aria-label={`Undo payment of ${bill.obligationName}`}
              className={small}
            >
              Undo payment
            </button>
          ) : (
            <>
              <button
                type="button"
                disabled={locked}
                onClick={() => open('details')}
                aria-label={`Enter invoice details for ${bill.obligationName}`}
                className={small}
              >
                Invoice details
              </button>
              <button
                type="button"
                disabled={locked}
                onClick={() => open('pay')}
                aria-label={`Pay ${bill.obligationName}`}
                className="rounded-lg bg-emerald-700 px-3 py-1 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-40"
              >
                Pay
              </button>
            </>
          )}
        </div>
      )}

      {mode === 'pay' && (
        <BillPayForm
          amountMkd={bill.amountMkd}
          onPay={async (values) => {
            await props.onPay(values);
            props.onOpen(false);
          }}
          onCancel={close}
        />
      )}

      {mode === 'details' && (
        <BillDetailsForm
          expectedAmountMkd={bill.expectedAmountMkd}
          actualAmountMkd={bill.actualAmountMkd}
          invoiceRef={bill.invoiceRef}
          onSave={async (values) => {
            await props.onSaveDetails(values);
            close();
          }}
          onCancel={close}
        />
      )}

      {mode === 'undo' && (
        <div className="mt-3 rounded-lg bg-amber-50 p-3 text-sm">
          <p>
            Undo this payment? The expense of {formatMkd(bill.amountMkd)} is removed and the bill is
            open again.
          </p>
          {problem && (
            <p role="alert" className="mt-2 text-red-700">
              {problem}
            </p>
          )}
          <div className="mt-3 flex gap-3">
            <button
              type="button"
              disabled={undoing}
              onClick={() => void undo()}
              className="rounded-lg bg-amber-700 px-3 py-1.5 font-medium text-white disabled:opacity-50"
            >
              {undoing ? 'Undoing…' : 'Yes, undo payment'}
            </button>
            <button
              type="button"
              disabled={undoing}
              onClick={close}
              className="rounded-lg border border-gray-300 px-3 py-1.5 disabled:opacity-50"
            >
              Keep payment
            </button>
          </div>
        </div>
      )}
    </li>
  );
}
