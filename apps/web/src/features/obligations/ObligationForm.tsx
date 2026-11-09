import { convertMkdToEur } from '@nestmint/finance-engine';
import {
  type CategoryGroupResponse,
  type CreateObligationData,
  createObligationSchema,
  fieldErrors,
  MAX_OBLIGATION_NAME_LENGTH,
  MAX_PAYEE_LENGTH,
  type ObligationRecurrence,
  type ObligationResponse,
} from '@nestmint/shared';
import { type FormEvent, useState } from 'react';
import { ApiError } from '../../api/client';
import { formatEurCents, localDay } from '../../format';
import { parseAmount } from '../spending/amount';
import { CategoryPicker } from '../spending/CategoryPicker';
import { MONTH_NAMES } from './obligationText';

interface ObligationFormProps {
  groups: CategoryGroupResponse[];
  /** Editing: the obligation to start from. The recurrence cannot be changed then. */
  initial?: ObligationResponse;
  submitLabel: string;
  /** Called with checked values. Throw the ApiError to show the server's message in the form. */
  onSave: (values: CreateObligationData) => Promise<void>;
  onCancel: () => void;
}

const input = 'mt-1 w-full rounded-lg border border-gray-300 px-3 py-2';
const label = 'text-sm font-medium text-gray-700';
const chip =
  'cursor-pointer rounded-full bg-gray-100 px-3 py-1.5 text-sm text-gray-700 has-checked:bg-emerald-700 has-checked:text-white has-focus-visible:ring-2 has-focus-visible:ring-emerald-500';

const RECURRENCES: ReadonlyArray<readonly [ObligationRecurrence, string]> = [
  ['monthly', 'Every month'],
  ['every_n_months', 'Every few months'],
  ['custom_months', 'Chosen months'],
];

function FieldError({ message }: { message: string | undefined }) {
  return message ? (
    <p role="alert" className="text-sm text-red-700">
      {message}
    </p>
  ) : null;
}

/** The bill fields, with checking. Used for adding (recurrence can be chosen) and for editing. */
export function ObligationForm({
  groups,
  initial,
  submitLabel,
  onSave,
  onCancel,
}: ObligationFormProps) {
  const today = localDay();
  const [recurrence, setRecurrence] = useState<ObligationRecurrence>(
    initial?.recurrence ?? 'monthly',
  );
  const [name, setName] = useState(initial?.name ?? '');
  const [payee, setPayee] = useState(initial?.payee ?? '');
  const [categoryId, setCategoryId] = useState(initial?.categoryId ?? '');
  const [amountText, setAmountText] = useState(initial ? String(initial.expectedAmountMkd) : '');
  const [dueDay, setDueDay] = useState(initial ? String(initial.dueDay) : '');
  const [everyN, setEveryN] = useState(initial?.everyNMonths ?? 3);
  const [months, setMonths] = useState<number[]>(initial?.months ?? []);
  const [startMonth, setStartMonth] = useState(initial?.startMonth ?? today.slice(0, 7));
  const [endMonth, setEndMonth] = useState(initial?.endMonth ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [problem, setProblem] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const parsed = parseAmount(amountText);
  const eur =
    parsed.status === 'ok' && parsed.value >= 1
      ? formatEurCents(convertMkdToEur(parsed.value, today).eurCents)
      : null;

  const toggleMonth = (month: number) =>
    setMonths((current) =>
      current.includes(month) ? current.filter((m) => m !== month) : [...current, month],
    );

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    setProblem(null);

    const result = createObligationSchema.safeParse({
      recurrence,
      name,
      payee,
      categoryId: categoryId === '' ? undefined : categoryId,
      expectedAmountMkd: parsed.status === 'ok' ? parsed.value : undefined,
      dueDay: dueDay.trim() === '' ? undefined : Number(dueDay),
      startMonth,
      endMonth: endMonth === '' ? null : endMonth,
      ...(recurrence === 'every_n_months' ? { everyNMonths: everyN } : {}),
      ...(recurrence === 'custom_months' ? { months } : {}),
    });
    const found: Record<string, string> = result.success ? {} : fieldErrors(result.error);
    // The box holds text, so a typo like "12.5" needs its own, clearer message than "Enter an amount".
    if (parsed.status === 'invalid') found.expectedAmountMkd = parsed.message;
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
          {RECURRENCES.find(([value]) => value === recurrence)?.[1]}
        </p>
      ) : (
        <fieldset>
          <legend className={label}>How often</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {RECURRENCES.map(([value, text]) => (
              <label key={value} className={chip}>
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
        <label htmlFor="obligation-name" className={label}>
          Name
        </label>
        <input
          id="obligation-name"
          type="text"
          autoFocus
          value={name}
          maxLength={MAX_OBLIGATION_NAME_LENGTH}
          onChange={(event) => setName(event.target.value)}
          aria-invalid={errors.name ? true : undefined}
          className={input}
        />
        <FieldError message={errors.name} />
      </div>

      <div>
        <label htmlFor="obligation-payee" className={label}>
          Who is paid (optional)
        </label>
        <input
          id="obligation-payee"
          type="text"
          value={payee}
          maxLength={MAX_PAYEE_LENGTH}
          onChange={(event) => setPayee(event.target.value)}
          aria-invalid={errors.payee ? true : undefined}
          className={input}
        />
        <FieldError message={errors.payee} />
      </div>

      <CategoryPicker
        groups={groups}
        value={categoryId}
        onChange={setCategoryId}
        error={errors.categoryId}
      />

      <div>
        <label htmlFor="obligation-amount" className={label}>
          Usual amount (MKD)
        </label>
        <input
          id="obligation-amount"
          type="text"
          inputMode="numeric"
          autoComplete="off"
          value={amountText}
          onChange={(event) => setAmountText(event.target.value)}
          aria-invalid={errors.expectedAmountMkd ? true : undefined}
          aria-describedby="obligation-amount-hint"
          className={input}
        />
        <p
          id="obligation-amount-hint"
          aria-live="polite"
          className="mt-1 min-h-5 text-sm text-gray-500"
        >
          {eur ? `≈ ${eur}` : ''}
        </p>
        <FieldError message={errors.expectedAmountMkd} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="obligation-due-day" className={label}>
            Due day (1–31)
          </label>
          <input
            id="obligation-due-day"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={dueDay}
            onChange={(event) => setDueDay(event.target.value)}
            aria-invalid={errors.dueDay ? true : undefined}
            className={input}
          />
          <FieldError message={errors.dueDay} />
        </div>
        {recurrence === 'every_n_months' && (
          <div>
            <label htmlFor="obligation-every" className={label}>
              Every how many months
            </label>
            <select
              id="obligation-every"
              value={everyN}
              onChange={(event) => setEveryN(Number(event.target.value))}
              aria-invalid={errors.everyNMonths ? true : undefined}
              className={input}
            >
              {Array.from({ length: 11 }, (_, i) => i + 2).map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            <FieldError message={errors.everyNMonths} />
          </div>
        )}
      </div>

      {recurrence === 'custom_months' && (
        <fieldset>
          <legend className={label}>Which months</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {MONTH_NAMES.map((text, index) => (
              <label key={text} className={chip}>
                <input
                  type="checkbox"
                  checked={months.includes(index + 1)}
                  onChange={() => toggleMonth(index + 1)}
                  className="sr-only"
                />
                {text}
              </label>
            ))}
          </div>
          <FieldError message={errors.months ?? errors['months.0']} />
        </fieldset>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="obligation-start" className={label}>
            From month
          </label>
          <input
            id="obligation-start"
            type="month"
            value={startMonth}
            onChange={(event) => setStartMonth(event.target.value)}
            aria-invalid={errors.startMonth ? true : undefined}
            className={input}
          />
          <FieldError message={errors.startMonth} />
        </div>
        <div>
          <label htmlFor="obligation-end" className={label}>
            Until month (optional)
          </label>
          <input
            id="obligation-end"
            type="month"
            value={endMonth}
            onChange={(event) => setEndMonth(event.target.value)}
            aria-invalid={errors.endMonth ? true : undefined}
            className={input}
          />
          <FieldError message={errors.endMonth} />
        </div>
      </div>

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
