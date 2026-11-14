import { suggestedPaymentMkd } from '@nestmint/finance-engine';
import {
  type CreateRateChangeData,
  createRateChangeSchema,
  fieldErrors,
  type ObligationResponse,
} from '@nestmint/shared';
import { type FormEvent, useState } from 'react';
import { ApiError } from '../../api/client';
import { formatMkd, localDay } from '../../format';
import { parseAmount } from '../spending/amount';
import { parseRatePercent } from './loanText';

interface RateChangeFormProps {
  loan: ObligationResponse;
  /** Called with checked values. Throw the ApiError to show the server's message in the form. */
  onSave: (values: CreateRateChangeData) => Promise<void>;
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

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

/**
 * The bank wrote that the rate changed: type the month it starts, the new rate and the new
 * payment from the letter. The app's own calculation is only a hint under the payment box.
 */
export function RateChangeForm({ loan, onSave, onCancel }: RateChangeFormProps) {
  const details = loan.loan;
  const [effectiveMonth, setEffectiveMonth] = useState(localDay().slice(0, 7));
  const [rateText, setRateText] = useState('');
  const [paymentText, setPaymentText] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [problem, setProblem] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const rate = parseRatePercent(rateText);
  const payment = parseAmount(paymentText);

  let suggestion: number | null = null;
  if (details && rate.status === 'ok' && MONTH.test(effectiveMonth) && loan.endMonth) {
    suggestion = suggestedPaymentMkd(
      {
        principalMkd: details.principalMkd,
        startMonth: loan.startMonth,
        endMonth: loan.endMonth,
        initial: { annualRateBp: details.annualRateBp, monthlyPaymentMkd: loan.expectedAmountMkd },
        changes: details.rateChanges,
      },
      effectiveMonth,
      rate.basisPoints,
    );
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    setProblem(null);

    const result = createRateChangeSchema.safeParse({
      effectiveMonth,
      annualRateBp: rate.status === 'ok' ? rate.basisPoints : undefined,
      monthlyPaymentMkd: payment.status === 'ok' ? payment.value : undefined,
    });
    const found: Record<string, string> = result.success ? {} : fieldErrors(result.error);
    if (rate.status === 'invalid') found.annualRateBp = rate.message;
    if (payment.status === 'invalid') found.monthlyPaymentMkd = payment.message;
    if (!result.success || rate.status === 'invalid' || payment.status === 'invalid') {
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
      <div>
        <label htmlFor="rate-month" className={label}>
          New terms start in
        </label>
        <input
          id="rate-month"
          type="month"
          autoFocus
          value={effectiveMonth}
          min={loan.startMonth}
          max={loan.endMonth ?? undefined}
          onChange={(event) => setEffectiveMonth(event.target.value)}
          aria-invalid={errors.effectiveMonth ? true : undefined}
          className={input}
        />
        <FieldError message={errors.effectiveMonth} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="rate-new-rate" className={label}>
            New yearly interest (%)
          </label>
          <input
            id="rate-new-rate"
            type="text"
            inputMode="decimal"
            autoComplete="off"
            value={rateText}
            onChange={(event) => setRateText(event.target.value)}
            aria-invalid={errors.annualRateBp ? true : undefined}
            className={input}
          />
          <FieldError message={errors.annualRateBp} />
        </div>
        <div>
          <label htmlFor="rate-new-payment" className={label}>
            New monthly payment (MKD)
          </label>
          <input
            id="rate-new-payment"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={paymentText}
            onChange={(event) => setPaymentText(event.target.value)}
            aria-invalid={errors.monthlyPaymentMkd ? true : undefined}
            aria-describedby="rate-payment-hint"
            className={input}
          />
          <FieldError message={errors.monthlyPaymentMkd} />
        </div>
      </div>
      <p id="rate-payment-hint" aria-live="polite" className="-mt-2 min-h-5 text-sm text-gray-500">
        {suggestion === null
          ? 'Type the payment from the bank’s letter.'
          : `For reference, the payment that pays off what is left by the last month is about ${formatMkd(suggestion)}. Use the bank’s figure.`}
      </p>
      <p className="text-sm text-gray-500">
        Bills you have not paid from that month on get the new payment. Paid bills and earlier
        months stay as they are.
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
          {saving ? 'Saving…' : 'Save rate change'}
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
