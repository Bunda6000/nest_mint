import {
  type ObligationResponse,
  type PayOffLoanData,
  fieldErrors,
  payOffLoanSchema,
} from '@nestmint/shared';
import { type FormEvent, useState } from 'react';
import { ApiError } from '../../api/client';
import { formatMkd, localDay } from '../../format';
import { parseAmount } from '../spending/amount';
import { estimateStillOwed } from './loanText';

interface PayOffFormProps {
  loan: ObligationResponse;
  onSave: (values: PayOffLoanData) => Promise<void>;
  onCancel: () => void;
}

const input = 'mt-1 w-full rounded-lg border border-gray-300 px-3 py-2';
const label = 'text-sm font-medium text-gray-700';

function FieldError({ message }: { message: string | undefined }) {
  return message ? (
    <p role="alert" className="text-sm text-red-700">
      {message}
    </p>
  ) : null;
}

/** Pays the whole loan off: the day and the amount the bank asks for. */
export function PayOffForm({ loan, onSave, onCancel }: PayOffFormProps) {
  const [paidOn, setPaidOn] = useState(localDay());
  const [amountText, setAmountText] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [problem, setProblem] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const amount = parseAmount(amountText);
  const estimate = estimateStillOwed(loan, localDay().slice(0, 7));

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    setProblem(null);
    const result = payOffLoanSchema.safeParse({
      paidOn,
      amountMkd: amount.status === 'ok' ? amount.value : undefined,
    });
    const found: Record<string, string> = result.success ? {} : fieldErrors(result.error);
    if (amount.status === 'invalid') found.amountMkd = amount.message;
    if (!result.success || amount.status === 'invalid') {
      setErrors(found);
      return;
    }
    setErrors({});
    setSaving(true);
    try {
      await onSave(result.data);
    } catch (error) {
      if (error instanceof ApiError) {
        setErrors(error.details);
        setProblem(error.message);
      } else {
        setProblem('Something went wrong. Please try again.');
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={(event) => void handleSubmit(event)} noValidate className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="payoff-date" className={label}>
            Paid on
          </label>
          <input
            id="payoff-date"
            type="date"
            value={paidOn}
            max={localDay()}
            onChange={(event) => setPaidOn(event.target.value)}
            aria-invalid={errors.paidOn ? true : undefined}
            className={input}
          />
          <FieldError message={errors.paidOn} />
        </div>
        <div>
          <label htmlFor="payoff-amount" className={label}>
            Payoff amount from the bank (MKD)
          </label>
          <input
            id="payoff-amount"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            autoFocus
            value={amountText}
            onChange={(event) => setAmountText(event.target.value)}
            aria-invalid={errors.amountMkd ? true : undefined}
            className={input}
          />
          <FieldError message={errors.amountMkd} />
        </div>
      </div>
      {estimate !== null && (
        <p className="text-sm text-gray-500">
          For reference, the app estimates about {formatMkd(estimate)} is still owed after this
          month's payment. Use the bank's figure.
        </p>
      )}
      <p className="text-sm text-gray-500">
        It is saved as an expense. The loan ends in that month and its unpaid bills from that month
        on are removed; paid bills stay.
      </p>
      {errors.form && (
        <p role="alert" className="text-sm text-red-700">
          {errors.form}
        </p>
      )}
      {problem && (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {problem}
        </p>
      )}
      <div className="flex gap-3">
        <button
          type="submit"
          disabled={saving}
          className="flex-1 rounded-lg bg-emerald-700 px-4 py-3 text-base font-medium text-white disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Pay off loan'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="rounded-lg border border-gray-300 px-4 py-3 text-base disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
