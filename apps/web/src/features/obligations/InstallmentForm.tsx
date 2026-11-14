import {
  type CategoryGroupResponse,
  type CreateInstallmentData,
  createInstallmentSchema,
  fieldErrors,
  MAX_OBLIGATION_NAME_LENGTH,
  MAX_PAYEE_LENGTH,
} from '@nestmint/shared';
import { type FormEvent, useState } from 'react';
import { ApiError } from '../../api/client';
import { localDay } from '../../format';
import { parseAmount } from '../spending/amount';
import { CategoryPicker } from '../spending/CategoryPicker';
import { previewInstallmentPlan } from './installmentText';

interface InstallmentFormProps {
  groups: CategoryGroupResponse[];
  /** Called with checked values. Throw the ApiError to show the server's message in the form. */
  onSave: (values: CreateInstallmentData) => Promise<void>;
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

interface AmountFieldProps {
  id: string;
  title: string;
  value: string;
  onChange: (value: string) => void;
  error: string | undefined;
}

function AmountField({ id, title, value, onChange, error }: AmountFieldProps) {
  return (
    <div>
      <label htmlFor={id} className={label}>
        {title}
      </label>
      <input
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={error ? true : undefined}
        className={input}
      />
      <FieldError message={error} />
    </div>
  );
}

/** A purchase paid to the seller in installments: the total, the first one and the regular one. */
export function InstallmentForm({ groups, onSave, onCancel }: InstallmentFormProps) {
  const [name, setName] = useState('');
  const [seller, setSeller] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [totalText, setTotalText] = useState('');
  const [firstText, setFirstText] = useState('');
  const [regularText, setRegularText] = useState('');
  const [dueDay, setDueDay] = useState('');
  const [startMonth, setStartMonth] = useState(localDay().slice(0, 7));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [problem, setProblem] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const total = parseAmount(totalText);
  const first = parseAmount(firstText);
  const regular = parseAmount(regularText);

  const preview =
    total.status === 'ok' && first.status === 'ok' && regular.status === 'ok'
      ? previewInstallmentPlan(total.value, first.value, regular.value, startMonth)
      : null;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    setProblem(null);

    const result = createInstallmentSchema.safeParse({
      name,
      payee: seller,
      categoryId: categoryId === '' ? undefined : categoryId,
      dueDay: dueDay.trim() === '' ? undefined : Number(dueDay),
      startMonth,
      contractTotalMkd: total.status === 'ok' ? total.value : undefined,
      firstInstallmentMkd: first.status === 'ok' ? first.value : undefined,
      regularInstallmentMkd: regular.status === 'ok' ? regular.value : undefined,
    });
    const found: Record<string, string> = result.success ? {} : fieldErrors(result.error);
    // The boxes hold text, so a typo needs its own, clearer message than "Enter an amount".
    if (total.status === 'invalid') found.contractTotalMkd = total.message;
    if (first.status === 'invalid') found.firstInstallmentMkd = first.message;
    if (regular.status === 'invalid') found.regularInstallmentMkd = regular.message;
    if (
      !result.success ||
      total.status === 'invalid' ||
      first.status === 'invalid' ||
      regular.status === 'invalid'
    ) {
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
        <label htmlFor="plan-name" className={label}>
          Name
        </label>
        <input
          id="plan-name"
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
        <label htmlFor="plan-seller" className={label}>
          Seller (optional)
        </label>
        <input
          id="plan-seller"
          type="text"
          value={seller}
          maxLength={MAX_PAYEE_LENGTH}
          onChange={(event) => setSeller(event.target.value)}
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

      <AmountField
        id="plan-total"
        title="Contract total (MKD)"
        value={totalText}
        onChange={setTotalText}
        error={errors.contractTotalMkd}
      />

      <div className="grid grid-cols-2 gap-3">
        <AmountField
          id="plan-first"
          title="First installment (MKD)"
          value={firstText}
          onChange={setFirstText}
          error={errors.firstInstallmentMkd}
        />
        <AmountField
          id="plan-regular"
          title="Regular installment (MKD)"
          value={regularText}
          onChange={setRegularText}
          error={errors.regularInstallmentMkd}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="plan-start" className={label}>
            First installment month
          </label>
          <input
            id="plan-start"
            type="month"
            value={startMonth}
            onChange={(event) => setStartMonth(event.target.value)}
            aria-invalid={errors.startMonth ? true : undefined}
            className={input}
          />
          <FieldError message={errors.startMonth} />
        </div>
        <div>
          <label htmlFor="plan-due-day" className={label}>
            Due day (1–31)
          </label>
          <input
            id="plan-due-day"
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
      </div>
      <p aria-live="polite" className="-mt-2 min-h-5 text-sm text-gray-500">
        {preview ?? 'The last installment is whatever is left of the contract total.'}
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
          {saving ? 'Saving…' : 'Save installment plan'}
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
