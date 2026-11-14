import {
  type CreateExtraPaymentData,
  createExtraPaymentSchema,
  EXTRA_PAYMENT_EFFECTS,
  type ExtraPaymentEffect,
  fieldErrors,
  type ObligationResponse,
} from '@nestmint/shared';
import { type FormEvent, useState } from 'react';
import { ApiError } from '../../api/client';
import { localDay } from '../../format';
import { parseAmount } from '../spending/amount';
import { EXTRA_EFFECT_LABELS } from './loanText';

interface ExtraPaymentFormProps {
  loan: ObligationResponse;
  /** Called with checked values. Throw the ApiError to show the server's message in the form. */
  onSave: (values: CreateExtraPaymentData) => Promise<void>;
  onCancel: () => void;
}

const input = 'mt-1 w-full rounded-lg border border-gray-300 px-3 py-2';
const label = 'text-sm font-medium text-gray-700';
const chip =
  'flex cursor-pointer items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm has-checked:border-emerald-700 has-checked:bg-emerald-50 has-focus-visible:ring-2 has-focus-visible:ring-emerald-500';

function FieldError({ message }: { message: string | undefined }) {
  return message ? (
    <p role="alert" className="text-sm text-red-700">
      {message}
    </p>
  ) : null;
}

/** Money paid on top of the regular payments, and what it should do to the loan. */
export function ExtraPaymentForm({ loan, onSave, onCancel }: ExtraPaymentFormProps) {
  const [paidOn, setPaidOn] = useState(localDay());
  const [amountText, setAmountText] = useState('');
  const [effect, setEffect] = useState<ExtraPaymentEffect>('shorten');
  const [newPaymentText, setNewPaymentText] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [problem, setProblem] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const amount = parseAmount(amountText);
  const newPayment = parseAmount(newPaymentText);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    setProblem(null);

    const result = createExtraPaymentSchema.safeParse({
      paidOn,
      amountMkd: amount.status === 'ok' ? amount.value : undefined,
      effect,
      ...(effect === 'lower_payment'
        ? { newMonthlyPaymentMkd: newPayment.status === 'ok' ? newPayment.value : undefined }
        : {}),
    });
    const found: Record<string, string> = result.success ? {} : fieldErrors(result.error);
    if (amount.status === 'invalid') found.amountMkd = amount.message;
    if (effect === 'lower_payment' && newPayment.status === 'invalid') {
      found.newMonthlyPaymentMkd = newPayment.message;
    }
    if (!result.success || amount.status === 'invalid' || found.newMonthlyPaymentMkd) {
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
          <label htmlFor="extra-date" className={label}>
            Paid on
          </label>
          <input
            id="extra-date"
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
          <label htmlFor="extra-amount" className={label}>
            Extra amount (MKD)
          </label>
          <input
            id="extra-amount"
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

      <fieldset>
        <legend className={label}>What should it do?</legend>
        <div className="mt-2 flex flex-col gap-2">
          {EXTRA_PAYMENT_EFFECTS.map((value) => (
            <label key={value} className={chip}>
              <input
                type="radio"
                name="extra-effect"
                value={value}
                checked={effect === value}
                onChange={() => {
                  setEffect(value);
                  setErrors({});
                }}
              />
              {EXTRA_EFFECT_LABELS[value]}
            </label>
          ))}
        </div>
        <FieldError message={errors.effect} />
      </fieldset>

      {effect === 'lower_payment' && (
        <div>
          <label htmlFor="extra-new-payment" className={label}>
            New monthly payment from the bank (MKD)
          </label>
          <input
            id="extra-new-payment"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={newPaymentText}
            onChange={(event) => setNewPaymentText(event.target.value)}
            aria-invalid={errors.newMonthlyPaymentMkd ? true : undefined}
            className={input}
          />
          <FieldError message={errors.newMonthlyPaymentMkd} />
        </div>
      )}

      <p className="text-sm text-gray-500">
        It is also saved as an expense in {loan.categoryName}. If it would pay off the whole loan,
        use Pay off instead.
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
          {saving ? 'Saving…' : 'Save extra payment'}
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
