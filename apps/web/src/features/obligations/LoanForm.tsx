import { annuityPaymentMkd, loanTermMonths } from '@nestmint/finance-engine';
import { convertMkdToEur } from '../../rates';
import {
  type CategoryGroupResponse,
  type CreateLoanData,
  type ObligationResponse,
  createLoanSchema,
  fieldErrors,
  LOAN_TYPES,
  type LoanType,
  MAX_OBLIGATION_NAME_LENGTH,
  MAX_PAYEE_LENGTH,
} from '@nestmint/shared';
import { type FormEvent, useState } from 'react';
import { ApiError } from '../../api/client';
import { formatEurCents, formatMkd, localDay } from '../../format';
import { parseAmount } from '../spending/amount';
import { CategoryPicker } from '../spending/CategoryPicker';
import { LOAN_TYPE_LABELS, parseRatePercent } from './loanText';

interface LoanFormProps {
  groups: CategoryGroupResponse[];
  /**
   * A loan to change. The payment box is then left out: a loan's payment and rate change with a
   * rate change, not by editing.
   */
  initial?: ObligationResponse;
  /** Called with checked values. Throw the ApiError to show the server's message in the form. */
  onSave: (values: CreateLoanData) => Promise<void>;
  onCancel: () => void;
}

const input = 'mt-1 w-full rounded-lg border border-gray-300 px-3 py-2';
const label = 'text-sm font-medium text-gray-700';
const chip =
  'cursor-pointer rounded-full bg-gray-100 px-3 py-1.5 text-sm text-gray-700 has-checked:bg-emerald-700 has-checked:text-white has-focus-visible:ring-2 has-focus-visible:ring-emerald-500';

function FieldError({ message }: { message: string | undefined }) {
  return message ? (
    <p role="alert" className="text-sm text-red-700">
      {message}
    </p>
  ) : null;
}

/** The loan fields. Leave the monthly payment empty and the app works it out. */
export function LoanForm({ groups, initial, onSave, onCancel }: LoanFormProps) {
  const today = localDay();
  const editing = initial !== undefined;
  const [loanType, setLoanType] = useState<LoanType>(initial?.loan?.loanType ?? 'housing');
  const [name, setName] = useState(initial?.name ?? '');
  const [lender, setLender] = useState(initial?.payee ?? '');
  const [categoryId, setCategoryId] = useState(initial?.categoryId ?? '');
  const [principalText, setPrincipalText] = useState(
    initial?.loan ? String(initial.loan.principalMkd) : '',
  );
  const [rateText, setRateText] = useState(
    initial?.loan ? String(initial.loan.annualRateBp / 100) : '',
  );
  const [paymentText, setPaymentText] = useState('');
  const [dueDay, setDueDay] = useState(initial ? String(initial.dueDay) : '');
  const [startMonth, setStartMonth] = useState(initial?.startMonth ?? today.slice(0, 7));
  const [endMonth, setEndMonth] = useState(initial?.endMonth ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [problem, setProblem] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const principal = parseAmount(principalText);
  const rate = parseRatePercent(rateText);
  const payment = parseAmount(paymentText);

  // What the monthly payment would be, shown while the bank's own figure is not typed in.
  let estimate: number | null = null;
  if (
    payment.status === 'empty' &&
    principal.status === 'ok' &&
    principal.value >= 1 &&
    rate.status === 'ok' &&
    /^\d{4}-(0[1-9]|1[0-2])$/.test(startMonth) &&
    /^\d{4}-(0[1-9]|1[0-2])$/.test(endMonth) &&
    endMonth >= startMonth
  ) {
    estimate = annuityPaymentMkd(
      principal.value,
      rate.basisPoints,
      loanTermMonths(startMonth, endMonth),
    );
  }
  const shownPayment = payment.status === 'ok' && payment.value >= 1 ? payment.value : estimate;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    setProblem(null);

    const result = createLoanSchema.safeParse({
      name,
      lender,
      loanType,
      principalMkd: principal.status === 'ok' ? principal.value : undefined,
      annualRateBp: rate.status === 'ok' ? rate.basisPoints : undefined,
      categoryId: categoryId === '' ? undefined : categoryId,
      dueDay: dueDay.trim() === '' ? undefined : Number(dueDay),
      startMonth,
      endMonth: endMonth === '' ? undefined : endMonth,
      ...(payment.status === 'ok' ? { monthlyPaymentMkd: payment.value } : {}),
    });
    const found: Record<string, string> = result.success ? {} : fieldErrors(result.error);
    // The boxes hold text, so a typo needs its own, clearer message than "Enter an amount".
    if (principal.status === 'invalid') found.principalMkd = principal.message;
    if (rate.status === 'invalid') found.annualRateBp = rate.message;
    if (payment.status === 'invalid') found.monthlyPaymentMkd = payment.message;
    if (
      !result.success ||
      principal.status === 'invalid' ||
      rate.status === 'invalid' ||
      payment.status === 'invalid'
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
      <fieldset>
        <legend className={label}>Type of loan</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {LOAN_TYPES.map((value) => (
            <label key={value} className={chip}>
              <input
                type="radio"
                name="loan-type"
                value={value}
                checked={loanType === value}
                onChange={() => {
                  setLoanType(value);
                  setErrors({});
                }}
                className="sr-only"
              />
              {LOAN_TYPE_LABELS[value]}
            </label>
          ))}
        </div>
        <FieldError message={errors.loanType} />
      </fieldset>

      <div>
        <label htmlFor="loan-name" className={label}>
          Name
        </label>
        <input
          id="loan-name"
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
        <label htmlFor="loan-lender" className={label}>
          Lender
        </label>
        <input
          id="loan-lender"
          type="text"
          value={lender}
          maxLength={MAX_PAYEE_LENGTH}
          onChange={(event) => setLender(event.target.value)}
          aria-invalid={errors.lender ? true : undefined}
          className={input}
        />
        <FieldError message={errors.lender} />
      </div>

      <CategoryPicker
        groups={groups}
        value={categoryId}
        onChange={setCategoryId}
        error={errors.categoryId}
      />

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="loan-principal" className={label}>
            Amount borrowed (MKD)
          </label>
          <input
            id="loan-principal"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={principalText}
            onChange={(event) => setPrincipalText(event.target.value)}
            aria-invalid={errors.principalMkd ? true : undefined}
            className={input}
          />
          <FieldError message={errors.principalMkd} />
        </div>
        {!editing && (
          <div>
            <label htmlFor="loan-rate" className={label}>
              Yearly interest (%)
            </label>
            <input
              id="loan-rate"
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
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="loan-start" className={label}>
            First payment month
          </label>
          <input
            id="loan-start"
            type="month"
            value={startMonth}
            onChange={(event) => setStartMonth(event.target.value)}
            aria-invalid={errors.startMonth ? true : undefined}
            className={input}
          />
          <FieldError message={errors.startMonth} />
        </div>
        <div>
          <label htmlFor="loan-end" className={label}>
            Last payment month
          </label>
          <input
            id="loan-end"
            type="month"
            value={endMonth}
            onChange={(event) => setEndMonth(event.target.value)}
            aria-invalid={errors.endMonth ? true : undefined}
            className={input}
          />
          <FieldError message={errors.endMonth} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="loan-due-day" className={label}>
            Due day (1–31)
          </label>
          <input
            id="loan-due-day"
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
        {!editing && (
          <div>
            <label htmlFor="loan-payment" className={label}>
              Monthly payment (MKD, optional)
            </label>
            <input
              id="loan-payment"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              value={paymentText}
              onChange={(event) => setPaymentText(event.target.value)}
              aria-invalid={errors.monthlyPaymentMkd ? true : undefined}
              aria-describedby="loan-payment-hint"
              className={input}
            />
            <FieldError message={errors.monthlyPaymentMkd} />
          </div>
        )}
      </div>
      {!editing && (
        <p
          id="loan-payment-hint"
          aria-live="polite"
          className="-mt-2 min-h-5 text-sm text-gray-500"
        >
          {shownPayment === null
            ? 'Leave the payment empty and it is worked out from the amount, interest and dates.'
            : `${estimate !== null ? 'Worked out: ' : 'Payment: '}${formatMkd(shownPayment)} a month (≈ ${formatEurCents(convertMkdToEur(shownPayment, today).eurCents)})`}
        </p>
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
          {saving ? 'Saving…' : editing ? 'Save changes' : 'Save loan'}
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
