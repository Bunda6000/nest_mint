import { convertMkdToEur } from '@nestmint/finance-engine';
import { amountMkdSchema, isoDateSchema } from '@nestmint/shared';
import { type FormEvent, useId, useMemo, useState } from 'react';
import { ApiError } from '../../api/client';
import { formatEurCents, localDay } from '../../format';
import { parseAmount } from '../spending/amount';

export interface PaymentValues {
  paidOn: string;
  amountMkd: number;
}

interface BillPayFormProps {
  /** What the bill costs now: the amount the box starts with. */
  amountMkd: number;
  /** Called with checked values. Throw the ApiError to show the server's message in the form. */
  onPay: (values: PaymentValues) => Promise<void>;
  onCancel: () => void;
}

/** Confirm a payment: the day (today) and the amount (what the bill costs), both editable. */
export function BillPayForm({ amountMkd, onPay, onCancel }: BillPayFormProps) {
  const id = useId();
  const [amountText, setAmountText] = useState(String(amountMkd));
  const [day, setDay] = useState(localDay());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [problem, setProblem] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const parsed = parseAmount(amountText);
  const eurPreview = useMemo(() => {
    if (parsed.status !== 'ok' || parsed.value < 1) return null;
    try {
      return formatEurCents(convertMkdToEur(parsed.value, day).eurCents);
    } catch {
      return null;
    }
  }, [parsed, day]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    setProblem(null);

    const found: Record<string, string> = {};
    const date = isoDateSchema.safeParse(day);
    if (!date.success) found.paidOn = date.error.issues[0]!.message;
    const amount = amountMkdSchema.safeParse(parsed.status === 'ok' ? parsed.value : undefined);
    if (!amount.success) found.amountMkd = amount.error.issues[0]!.message;
    if (parsed.status === 'invalid') found.amountMkd = parsed.message;
    if (!date.success || !amount.success || parsed.status === 'invalid') {
      setErrors(found);
      return;
    }
    setErrors({});

    setSaving(true);
    try {
      await onPay({ paidOn: date.data, amountMkd: amount.data });
    } catch (error) {
      if (error instanceof ApiError) {
        setErrors(error.details);
        setProblem(error.message);
      } else {
        setProblem('Something went wrong. Please try again.');
      }
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={(event) => void handleSubmit(event)}
      noValidate
      className="mt-3 flex flex-col gap-3"
    >
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor={`${id}-day`} className="text-sm font-medium text-gray-700">
            Paid on
          </label>
          <input
            id={`${id}-day`}
            type="date"
            value={day}
            onChange={(event) => setDay(event.target.value)}
            aria-invalid={errors.paidOn ? true : undefined}
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
          />
          {errors.paidOn && (
            <p role="alert" className="text-sm text-red-700">
              {errors.paidOn}
            </p>
          )}
        </div>
        <div>
          <label htmlFor={`${id}-amount`} className="text-sm font-medium text-gray-700">
            Amount paid (MKD)
          </label>
          <input
            id={`${id}-amount`}
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={amountText}
            onChange={(event) => setAmountText(event.target.value)}
            aria-invalid={errors.amountMkd ? true : undefined}
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
          />
          <p aria-live="polite" className="min-h-5 text-sm text-gray-500">
            {eurPreview ? `≈ ${eurPreview}` : ''}
          </p>
          {errors.amountMkd && (
            <p role="alert" className="text-sm text-red-700">
              {errors.amountMkd}
            </p>
          )}
        </div>
      </div>

      {problem && (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {problem}
        </p>
      )}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={saving}
          className="flex-1 rounded-lg bg-emerald-700 px-4 py-2 font-medium text-white disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Mark as paid'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="rounded-lg border border-gray-300 px-4 py-2 disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
