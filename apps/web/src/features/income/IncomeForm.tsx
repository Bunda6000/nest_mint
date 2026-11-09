import { convertMkdToEur } from '@nestmint/finance-engine';
import {
  createIncomeSchema,
  fieldErrors,
  type IncomeRecurrence,
  type IncomeResponse,
  MAX_INCOME_NAME_LENGTH,
  type CreateIncomeData,
} from '@nestmint/shared';
import { type FormEvent, useState } from 'react';
import { ApiError } from '../../api/client';
import { formatEurCents, localDay } from '../../format';
import { parseAmount } from '../spending/amount';

interface IncomeFormProps {
  /** Editing: the income to start from. The type cannot be changed then. */
  initial?: IncomeResponse;
  submitLabel: string;
  /** Called with checked values. Throw the ApiError to show the server's message in the form. */
  onSave: (values: CreateIncomeData) => Promise<void>;
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

/** The income fields, with checking. Used for adding (type can be chosen) and for editing. */
export function IncomeForm({ initial, submitLabel, onSave, onCancel }: IncomeFormProps) {
  const today = localDay();
  const [recurrence, setRecurrence] = useState<IncomeRecurrence>(initial?.recurrence ?? 'monthly');
  const [name, setName] = useState(initial?.name ?? '');
  const [amountText, setAmountText] = useState(initial ? String(initial.amountMkd) : '');
  const [payDay, setPayDay] = useState(initial?.payDay ? String(initial.payDay) : '');
  const [startMonth, setStartMonth] = useState(initial?.startMonth ?? today.slice(0, 7));
  const [endMonth, setEndMonth] = useState(initial?.endMonth ?? '');
  const [receivedOn, setReceivedOn] = useState(initial?.receivedOn ?? today);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [problem, setProblem] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const parsed = parseAmount(amountText);
  const eur =
    parsed.status === 'ok' && parsed.value >= 1
      ? formatEurCents(
          convertMkdToEur(parsed.value, recurrence === 'one_off' ? receivedOn || today : today)
            .eurCents,
        )
      : null;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    setProblem(null);

    const amountMkd = parsed.status === 'ok' ? parsed.value : undefined;
    const result = createIncomeSchema.safeParse(
      recurrence === 'monthly'
        ? {
            recurrence,
            name,
            amountMkd,
            startMonth,
            endMonth: endMonth === '' ? null : endMonth,
            payDay: payDay.trim() === '' ? undefined : Number(payDay),
          }
        : { recurrence, name, amountMkd, receivedOn },
    );
    const found: Record<string, string> = result.success ? {} : fieldErrors(result.error);
    // The box holds text, so a typo like "12.5" needs its own, clearer message than "Enter an amount".
    if (parsed.status === 'invalid') found.amountMkd = parsed.message;
    if (!result.success || parsed.status === 'invalid') {
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
      {initial ? (
        <p className="text-sm text-gray-500">
          {recurrence === 'monthly' ? 'Monthly salary' : 'One-off income'}
        </p>
      ) : (
        <fieldset>
          <legend className={label}>Type</legend>
          <div className="mt-2 flex gap-2">
            {(
              [
                ['monthly', 'Monthly salary'],
                ['one_off', 'One-off income'],
              ] as const
            ).map(([value, text]) => (
              <label
                key={value}
                className="cursor-pointer rounded-full bg-gray-100 px-3 py-1.5 text-sm text-gray-700 has-checked:bg-emerald-700 has-checked:text-white has-focus-visible:ring-2 has-focus-visible:ring-emerald-500"
              >
                <input
                  type="radio"
                  name="recurrence"
                  value={value}
                  checked={recurrence === value}
                  onChange={() => {
                    setRecurrence(value);
                    setErrors({});
                  }}
                  className="sr-only"
                />
                {text}
              </label>
            ))}
          </div>
        </fieldset>
      )}

      <div>
        <label htmlFor="income-name" className={label}>
          Name
        </label>
        <input
          id="income-name"
          type="text"
          autoFocus
          value={name}
          maxLength={MAX_INCOME_NAME_LENGTH}
          onChange={(event) => setName(event.target.value)}
          aria-invalid={errors.name ? true : undefined}
          className={input}
        />
        <FieldError message={errors.name} />
      </div>

      <div>
        <label htmlFor="income-amount" className={label}>
          Amount (MKD)
        </label>
        <input
          id="income-amount"
          type="text"
          inputMode="numeric"
          autoComplete="off"
          value={amountText}
          onChange={(event) => setAmountText(event.target.value)}
          aria-invalid={errors.amountMkd ? true : undefined}
          aria-describedby="income-amount-hint"
          className={input}
        />
        <p
          id="income-amount-hint"
          aria-live="polite"
          className="mt-1 min-h-5 text-sm text-gray-500"
        >
          {eur ? `≈ ${eur}` : ''}
        </p>
        <FieldError message={errors.amountMkd} />
      </div>

      {recurrence === 'monthly' ? (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="income-pay-day" className={label}>
                Pay day (1–31)
              </label>
              <input
                id="income-pay-day"
                type="text"
                inputMode="numeric"
                autoComplete="off"
                value={payDay}
                onChange={(event) => setPayDay(event.target.value)}
                aria-invalid={errors.payDay ? true : undefined}
                className={input}
              />
              <FieldError message={errors.payDay} />
            </div>
            <div>
              <label htmlFor="income-start" className={label}>
                From month
              </label>
              <input
                id="income-start"
                type="month"
                value={startMonth}
                onChange={(event) => setStartMonth(event.target.value)}
                aria-invalid={errors.startMonth ? true : undefined}
                className={input}
              />
              <FieldError message={errors.startMonth} />
            </div>
          </div>
          <div>
            <label htmlFor="income-end" className={label}>
              Until month (optional)
            </label>
            <input
              id="income-end"
              type="month"
              value={endMonth}
              onChange={(event) => setEndMonth(event.target.value)}
              aria-invalid={errors.endMonth ? true : undefined}
              aria-describedby="income-end-hint"
              className={input}
            />
            <p id="income-end-hint" className="mt-1 text-sm text-gray-500">
              Salary changed? Set the last month here and add the new salary separately, so past
              months stay correct.
            </p>
            <FieldError message={errors.endMonth} />
          </div>
        </>
      ) : (
        <div>
          <label htmlFor="income-date" className={label}>
            Date received
          </label>
          <input
            id="income-date"
            type="date"
            value={receivedOn}
            onChange={(event) => setReceivedOn(event.target.value)}
            aria-invalid={errors.receivedOn ? true : undefined}
            className={input}
          />
          <FieldError message={errors.receivedOn} />
        </div>
      )}

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
          {saving ? 'Saving…' : submitLabel}
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
